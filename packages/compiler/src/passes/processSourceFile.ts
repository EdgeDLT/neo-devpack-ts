import { Node, Symbol, FunctionDeclaration, JSDocTag, VariableStatement, Expression, SyntaxKind, BigIntLiteral, NumericLiteral, StringLiteral, VariableDeclarationKind, SourceFile, ts, Type } from "ts-morph";
import { createScope, Scope } from "../scope";
import * as ROA from 'fp-ts/ReadonlyArray'
import * as S from 'fp-ts/State'
import * as TS from '../utility/TS';
import * as E from "fp-ts/Either";
import * as O from 'fp-ts/Option'

import { createDiagnostic } from "../utils";
import { identity, pipe } from "fp-ts/function";
import { ContractMethod } from "../compiler";
import { ParseError, SymbolDef } from "../symbolDef";
import { parseContractMethod } from "./processFunctionDeclarations";

export const makeParseDiagnostic = (e: ParseError) => createDiagnostic(e.message, { node: e.node });

export const makeParseError =
    (node?: Node) =>
        (e: string | unknown): ParseError => {
            const message = typeof e === 'string'
                ? e : e instanceof Error
                    ? e.message : String(e);
            return { message, node };
        }

export const parseSymbol = (node: Node): E.Either<ParseError, Symbol> => {
    return pipe(
        node,
        TS.getSymbol,
        E.fromOption(() => makeParseError(node)('invalid symbol'))
    );
}

type ConstantValue = bigint | boolean | Uint8Array | null;

class ConstantSymbolDef implements SymbolDef {
    get name() { return this.symbol.getName(); }
    get typeName() { return this.type.getSymbol()?.getName(); }

    constructor(
        readonly symbol: Symbol,
        readonly type: Type,
        readonly value: ConstantValue
    ) {
        this.type = null!;
    }
}

class EventSymbolDef implements SymbolDef {
    readonly type: Type;

    get name() { return this.symbol.getName(); }
    get typeName() { return this.type.getSymbol()?.getName(); }

    constructor(
        readonly symbol: Symbol,
        readonly decl: FunctionDeclaration,
        readonly eventName: string
    ) {
        this.type = decl.getType();
    }

    static create(decl: FunctionDeclaration, tag: JSDocTag): E.Either<ParseError, EventSymbolDef> {
        return pipe(
            decl,
            parseSymbol,
            E.map(symbol => {
                const eventName = tag.getCommentText() ?? symbol.getName();
                return new EventSymbolDef(symbol, decl, eventName);
            })
        );
    }
}

class FunctionSymbolDef implements SymbolDef {
    readonly type: Type;

    get name() { return this.symbol.getName(); }
    get typeName() { return this.type.getSymbol()?.getName(); }

    constructor(readonly symbol: Symbol, readonly decl: FunctionDeclaration) {
        this.type = this.decl.getType();
    }

    static create(decl: FunctionDeclaration): E.Either<ParseError, FunctionSymbolDef> {
        return pipe(
            decl,
            parseSymbol,
            E.map(s => new FunctionSymbolDef(s, decl)),
        )
    }
}

function isFunctionSymbolDef(def: SymbolDef): def is FunctionSymbolDef {
    return def instanceof FunctionSymbolDef;
}

const parseSrcFunctionDeclaration = (node: FunctionDeclaration): E.Either<ParseError, SymbolDef> => {
    if (node.hasDeclareKeyword()) {
        return pipe(
            node,
            TS.getTag("event"),
            E.fromOption(() => makeParseError(node)('only @event declare functions supported')),
            E.chain(tag => EventSymbolDef.create(node, tag)),
        )
    } else {
        return FunctionSymbolDef.create(node);
    }
}

const parseSrcLetVariableStatement = (node: VariableStatement): E.Either<ReadonlyArray<ParseError>, ReadonlyArray<SymbolDef>> => {
    if (node.getDeclarationKind() === VariableDeclarationKind.Const)
        return E.left(ROA.of(makeParseError(node)('const variable statement passed to parseSrcLetVariableStatement')))

    return E.left(ROA.of(makeParseError(node)(`parseSrcVariableStatement not implemented`)));
}

const parseConstantValue =
    (node: Expression): E.Either<ParseError, {type: Type, value: ConstantValue}> => {
        const type = node.getType();
        switch (node.getKind()) {
            case SyntaxKind.NullKeyword:
                return E.of({ type, value: null});
            case SyntaxKind.FalseKeyword:
                return E.of({ type, value: false});
            case SyntaxKind.TrueKeyword:
                return E.of({ type, value: true});
            case SyntaxKind.BigIntLiteral: {
                const literal = (node as BigIntLiteral).getLiteralValue() as bigint;
                return E.of({ type, value: literal});
            }
            case SyntaxKind.NumericLiteral: {
                const literal = (node as NumericLiteral).getLiteralValue();
                return Number.isInteger(literal)
                    ? E.of({ type, value: BigInt(literal)})
                    : E.left(makeParseError(node)(`invalid non-integer numeric literal ${literal}`));
            }
            case SyntaxKind.StringLiteral: {
                const literal = (node as StringLiteral).getLiteralValue();
                return E.of({ type, value: Buffer.from(literal, 'utf8')});
            }
            // case tsm.SyntaxKind.ArrayLiteralExpression: 
            // case tsm.SyntaxKind.ObjectLiteralExpression:
            default:
                return E.left(makeParseError(node)(`Unsupported const type ${node.getKindName()}`));
        }
    }

const parseConstVariableStatement = (node: VariableStatement): E.Either<ReadonlyArray<ParseError>, ReadonlyArray<SymbolDef>> => {

    if (node.getDeclarationKind() !== VariableDeclarationKind.Const)
        return E.left(ROA.of(makeParseError(node)('non const variable statement passed to parseConstVariableStatement')))

    const { left: failures, right: sources } = pipe(
        node.getDeclarations(),
        ROA.map(decl => {
            return pipe(
                decl.getInitializer(),
                E.fromNullable(makeParseError(decl)('missing initializer')),
                E.chain(parseConstantValue),
                E.bindTo('value'),
                E.bind('symbol', () => parseSymbol(decl)),
                E.map(({ value, symbol }) => new ConstantSymbolDef(symbol, value.type, value.value))
            )
        }),
        ROA.partitionMap(identity),
    )

    return failures.length > 1 ? E.left(failures) : E.right(sources);
}

const parseSrcDeclaration = (node: Node): E.Either<ReadonlyArray<ParseError>, ReadonlyArray<SymbolDef>> => {
    if (Node.isFunctionDeclaration(node)) {
        return pipe(
            node,
            parseSrcFunctionDeclaration,
            E.map(ROA.of),
            E.mapLeft(ROA.of)
        );
    }
    if (Node.isVariableStatement(node)) {
        if (node.getDeclarationKind() === VariableDeclarationKind.Const) {
            return parseConstVariableStatement(node);
        } else {
            return parseSrcLetVariableStatement(node);
        }
    }
    if (node.getKind() == SyntaxKind.EndOfFileToken) return E.of(ROA.empty);
    return E.left(ROA.of(makeParseError(node)(`parseSourceFileSymbols ${node.getKindName()}`)));
}

const parseSrcDeclarations = (src: SourceFile): E.Either<ReadonlyArray<ParseError>, ReadonlyArray<SymbolDef>> => {

    if (src.isDeclarationFile()) { return E.of([]) }

    let defs: ReadonlyArray<SymbolDef> = ROA.empty;
    for (const child of pipe(src, TS.getChildren)) {
        const result = parseSrcDeclaration(child);
        if (E.isLeft(result)) return result;
        defs = ROA.concat(result.right)(defs);
    }
    return E.of(defs);
}

export const parseSourceFile =
    (src: SourceFile, parentScope: Scope): S.State<ReadonlyArray<ts.Diagnostic>, ReadonlyArray<ContractMethod>> =>
        diagnostics => {
            if (src.isDeclarationFile()) {
                const diag = createDiagnostic(`${src.getFilePath()} is a declaration file`, {
                    node: src,
                    category: ts.DiagnosticCategory.Warning
                });
                return [[], ROA.append(diag)(diagnostics)]
            }

            const srcDeclsE = pipe(
                src,
                parseSrcDeclarations,
                E.mapLeft(ROA.map(makeParseDiagnostic)),
            );
            if (E.isLeft(srcDeclsE)) {
                return [[], ROA.concat(srcDeclsE.left)(diagnostics)];
            }

            const scope = createScope(parentScope)(srcDeclsE.right);

            let methods: ReadonlyArray<ContractMethod> = ROA.empty;
            pipe(
                srcDeclsE.right,
                ROA.filterMap(O.fromPredicate(isFunctionSymbolDef)),
                ROA.map(f => parseContractMethod(scope)(f.decl)),
                ROA.map(
                    E.match(
                        errors => {
                            diagnostics = pipe(
                                errors,
                                ROA.map(makeParseDiagnostic),
                                ROA.concat(diagnostics)
                            )
                        },
                        method => {
                            methods = ROA.append(method)(methods);
                        }
                    )
                )
            )
            return [methods, diagnostics]
        }