import { CallOperation, CallTokenOperation, LoadStoreOperation, Operation, parseOperation, PushBoolOperation, PushDataOperation, PushIntOperation, SysCallOperation } from "./types/Operation";
import { createDiagnostic as $createDiagnostic, getArguments, isVoidLike } from "./utils";

import { sc, u } from '@cityofzion/neon-core';
import { ts, Node, VariableStatement, VariableDeclarationKind, SourceFile, Project, Symbol, VariableDeclaration, Expression, SyntaxKind, BigIntLiteral, NumericLiteral, StringLiteral, FunctionDeclaration, ImportDeclaration, ImportSpecifier, JSDocTag, InterfaceDeclaration, DiagnosticCategory, ParameterDeclaration, CallExpression, ExportedDeclarations } from "ts-morph";
import { flow, pipe } from 'fp-ts/function';
import * as ROA from 'fp-ts/ReadonlyArray';
import * as RONEA from 'fp-ts/ReadonlyNonEmptyArray';
import * as E from "fp-ts/Either";
import * as M from "fp-ts/Monoid";
import * as O from 'fp-ts/Option'
import * as SG from "fp-ts/Semigroup";
import * as S from 'fp-ts/State';
import { CompilerState } from "./compiler";
import { Scope } from "./scope";

type Diagnostic = ts.Diagnostic;

export interface ParseError { message: string, node?: Node }

export const createDiagnostic = (e: ParseError) => $createDiagnostic(e.message, { node: e.node });

export interface SymbolDef {
    readonly symbol: Symbol;
}








































// const parseArguments = (scope: Scope) => (node: CallExpression) => {
//     return pipe(
//         node,
//         getArguments,
//         ROA.map(parseExpression(scope)),
//         ROA.sequence(E.Applicative),
//         E.map(ROA.reverse),
//         E.map(ROA.flatten),
//     );
// }

// const parseCall =
//     (scope: Scope) =>
//         (call: readonly Operation[]) =>
//             (node: CallExpression) => {
//                 return pipe(
//                     node,
//                     parseArguments(scope),
//                     E.bindTo('args'),
//                     E.bind('call', () => E.right(call))
//                 )
//             }

// export interface SymbolDef {
//     readonly symbol: Symbol;
//     readonly loadOperations?: ReadonlyArray<Operation>
// }

// // the modelling of this is a little strange. Properties may not exist, so parseGetProp
// // returns an Option. However, I'm wondering - *could* the access codegen fail? In the
// // case of Uint8Array.from, it could not (since there is no code gen in that scenario),
// // so I'm not going to model access with Either. However, this could change as we build
// // out more of the compiler. 

// export type GetPropResult = {
//     readonly value: SymbolDef
//     readonly access: readonly Operation[],
// };

// export interface ObjectSymbolDef extends SymbolDef {
//     parseGetProp(prop: Symbol): O.Option<GetPropResult>
// }

// export function isObjectDef(def: SymbolDef): def is ObjectSymbolDef {
//     return 'parseGetProp' in def && typeof def.parseGetProp === 'function';
// }

// export type CallResult = {
//     readonly args: ReadonlyArray<Operation>,
//     readonly call: ReadonlyArray<Operation>,
// };

// export interface CallableSymbolDef extends ObjectSymbolDef {
//     parseCall(node: CallExpression, scope: Scope): E.Either<ParseError, CallResult>
// }


// export function isCallableDef(def: SymbolDef): def is CallableSymbolDef {
//     return  /*isObjectDef(def) &&*/ 'parseCall' in def && typeof def.parseCall === 'function';
// }

// export class InterfaceSymbolDef implements SymbolDef {
//     constructor(
//         readonly symbol: Symbol,
//         readonly node: InterfaceDeclaration,
//     ) { }
// }

// export class FunctionSymbolDef implements CallableSymbolDef {
//     constructor(
//         readonly symbol: Symbol,
//         readonly node: FunctionDeclaration,
//         readonly $import: boolean,
//     ) { }

//     parseCall(node: CallExpression, scope: Scope): E.Either<ParseError, CallResult> {
//         const call = ROA.of({ kind: 'call', method: this.symbol } as CallOperation)
//         return pipe(node, parseCall(scope)(call));
//     }

//     parseGetProp(prop: Symbol) { return O.none; }

//     static create = ($import: boolean) =>
//         (node: FunctionDeclaration, symbol: Symbol) =>
//             new FunctionSymbolDef(symbol, node, $import);
// }

// type ConstantValue = bigint | boolean | Uint8Array | null;

// export class ConstantSymbolDef implements SymbolDef {
//     constructor(
//         readonly symbol: Symbol,
//         readonly value: ConstantValue
//     ) { }

//     get loadOperations(): ReadonlyArray<Operation> {
//         if (this.value === null) return [{ kind: 'pushnull' }];
//         if (this.value instanceof Uint8Array)
//             return [{ kind: 'pushdata', value: this.value } as PushDataOperation];
//         const type = typeof this.value;
//         if (type === 'bigint')
//             return [{ kind: 'pushint', value: this.value } as PushIntOperation];
//         if (type === 'boolean')
//             return [{ kind: 'pushbool', value: this.value } as PushBoolOperation];

//         throw new Error(`Invalid ConstantValue ${this.value}`);
//     }
// }

// export class VariableSymbolDef implements SymbolDef {
//     constructor(
//         readonly symbol: Symbol,
//         readonly kind: 'arg' | 'local' | 'static',
//         readonly index: number
//     ) { }

//     get loadOperations(): ReadonlyArray<Operation> {
//         const kind = this.kind === 'arg'
//             ? "loadarg"
//             : this.kind === 'local'
//                 ? 'loadlocal'
//                 : 'loadstatic';
//         return [{ kind, index: this.index } as LoadStoreOperation];
//     }
// }

// export class EventSymbolDef implements CallableSymbolDef {
//     constructor(
//         readonly symbol: Symbol,
//         readonly name: string,
//         readonly parameters: ReadonlyArray<ParameterDeclaration>,
//     ) { }

//     parseGetProp(prop: Symbol) { return O.none; }

//     parseCall(node: CallExpression, scope: Scope): E.Either<ParseError, CallResult> {
//         const call = ROA.of({ kind: 'syscall', name: "System.Runtime.Notify" } as Operation)
//         return pipe(
//             node,
//             parseCall(scope)(call),
//             E.map(o => {
//                 // NCCS creates an empty array and then APPENDs each notification arg in turn
//                 // However, APPEND is 4x more expensive than PACK and is called once per arg
//                 // instead of once per Notify call as PACK is. 
//                 const args = pipe(o.args,
//                     ROA.concat([
//                         { kind: "pushint", value: BigInt(node.getArguments().length) },
//                         { kind: 'pack' },
//                         { kind: 'pushdata', value: Buffer.from(this.name, 'utf8') }] as Operation[])
//                 );
//                 return { ...o, args };
//             })
//         )
//     }
// }

// export class SysCallSymbolDef implements CallableSymbolDef {
//     constructor(
//         readonly symbol: Symbol,
//         readonly name: string,
//     ) { }

//     parseGetProp(prop: Symbol) { return O.none; }

//     parseCall(node: CallExpression, scope: Scope): E.Either<ParseError, CallResult> {
//         const call = ROA.of({ kind: 'syscall', name: this.name } as Operation)
//         return pipe(node, parseCall(scope)(call));
//     }
// }

// export class MethodTokenSymbolDef implements CallableSymbolDef {
//     constructor(
//         readonly symbol: Symbol,
//         readonly token: sc.MethodToken
//     ) { }

//     parseGetProp(prop: Symbol) { return O.none; }

//     parseCall(node: CallExpression, scope: Scope): E.Either<ParseError, CallResult> {
//         const call = ROA.of({ kind: "calltoken", token: this.token } as CallTokenOperation)
//         return pipe(node, parseCall(scope)(call));
//     }
// }

// export class OperationsSymbolDef implements CallableSymbolDef {
//     constructor(
//         readonly symbol: Symbol,
//         readonly operations: ReadonlyArray<Operation>
//     ) { }

//     parseGetProp(prop: Symbol) { return O.none; }

//     parseCall(node: CallExpression, scope: Scope): E.Either<ParseError, CallResult> {
//         return pipe(node, parseCall(scope)(this.operations));
//     }
// }




// export const getResultSemigroup =
//     <T>(sg: SG.Semigroup<T>): SG.Semigroup<ParseResult<T>> => ({
//         concat: (x, y) =>
//             pipe(
//                 x,
//                 E.bindTo('x'),
//                 E.bind('y', () => y),
//                 E.map(({ x, y }) => sg.concat(x, y))
//             )
//     });

// export const getResultMonoid =
//     <T>(monoid: M.Monoid<T>): M.Monoid<ParseResult<T>> => ({
//         concat: getResultSemigroup(monoid).concat,
//         empty: E.right(monoid.empty)
//     });

// const getSymbol =
//     (symbol?: Symbol) =>
//         (node: Node): O.Option<Symbol> => {
//             return pipe(
//                 symbol,
//                 O.fromNullable,
//                 O.alt(() => O.fromNullable(node.getSymbol()))
//             );
//         }

// export const parseSymbol =
//     (symbol?: Symbol) =>
//         (node: Node): ParseResult<Symbol> => {
//             return pipe(
//                 node,
//                 getSymbol(symbol),
//                 E.fromOption(() => makeParseError(node)('undefined symbol'))
//             );
//         }

// const parseConstantValue =
//     (node: Expression): ParseResult<ConstantValue> => {
//         switch (node.getKind()) {
//             case SyntaxKind.NullKeyword:
//                 return E.right(null);
//             case SyntaxKind.FalseKeyword:
//                 return E.right(false);
//             case SyntaxKind.TrueKeyword:
//                 return E.right(true);
//             case SyntaxKind.BigIntLiteral: {
//                 const literal = (node as BigIntLiteral).getLiteralValue() as bigint;
//                 return E.right(literal);
//             }
//             case SyntaxKind.NumericLiteral: {
//                 const literal = (node as NumericLiteral).getLiteralValue();
//                 return Number.isInteger(literal)
//                     ? E.right(BigInt(literal))
//                     : E.left(makeParseError(node)(`invalid non-integer numeric literal ${literal}`));
//             }
//             case SyntaxKind.StringLiteral: {
//                 const literal = (node as StringLiteral).getLiteralValue();
//                 return E.right(Buffer.from(literal, 'utf8'));
//             }
//             // case tsm.SyntaxKind.ArrayLiteralExpression: 
//             // case tsm.SyntaxKind.ObjectLiteralExpression:
//             default:
//                 return E.left(makeParseError(node)(`Unsupported const type ${node.getKindName()}`));
//         }
//     }

// const parseConstVariableDeclaration =
//     (symbol?: Symbol) =>
//         (node: VariableDeclaration): ParseResult<SymbolDef> =>
//             pipe(
//                 node.getInitializer(),
//                 O.fromNullable,
//                 E.fromOption(() =>
//                     makeParseError(node)("missing initializer")),
//                 E.chain(parseConstantValue),
//                 E.bindTo("value"),
//                 E.bind("symbol", () =>
//                     pipe(
//                         node,
//                         parseSymbol(symbol)
//                     )),
//                 E.map(({ symbol, value }) =>
//                     new ConstantSymbolDef(symbol, value))
//             );

// const parseVariableDeclaration =
//     (symbol?: Symbol) =>
//         (node: VariableDeclaration): ParseResult<SymbolDef> =>
//             pipe(
//                 node.getVariableStatement(),
//                 E.fromNullable(makeParseError(node)("failed to get DeclarationKind")),
//                 E.map(stmt => stmt.getDeclarationKind()),
//                 E.chain(kind => kind === VariableDeclarationKind.Const
//                     ? parseConstVariableDeclaration(symbol)(node)
//                     : E.left(makeParseError(node)(`${kind} VariableDeclaration not implemented`))),
//             );

// const parseVariableStatement =
//     (node: VariableStatement): ParseResult<ReadonlyArray<SymbolDef>> => {
//         return pipe(
//             node.getDeclarations(),
//             ROA.map(parseVariableDeclaration()),
//             ROA.sequence(E.Applicative)
//         );
//     }

// const regexMethodToken = /\{((?:0x)?[0-9a-fA-F]{40})\} ([_a-zA-Z0-9]+)/
// const parseMethodToken =
//     (node: FunctionDeclaration) =>
//         (tag: JSDocTag): ParseResult<sc.MethodToken> => {
//             const comment = tag.getCommentText() ?? "";
//             const matches = comment.match(regexMethodToken) ?? [];
//             return matches.length === 3
//                 ? E.right(
//                     new sc.MethodToken({
//                         hash: u.HexString.fromHex(matches[1], true).toString(),
//                         method: matches[2],
//                         parametersCount: node.getParameters().length,
//                         hasReturnValue: !isVoidLike(node.getReturnType()),
//                         callFlags: sc.CallFlags.All
//                     }))
//                 : E.left(
//                     makeParseError(node)(`invalid method token tag comment "${comment}"`)
//                 );
//         }

// const regexOperation = /(\S+)\s?(\S+)?/
// const $parseOperation =
//     (node: Node) =>
//         (comment: string): ParseResult<Operation> => {
//             const matches = comment.match(regexOperation) ?? [];
//             const error = makeParseError(node)(`invalid operation tag comment "${comment}"`);
//             return matches.length === 3
//                 ? pipe(
//                     parseOperation(matches[1], matches[2]),
//                     E.fromNullable(error)
//                 )
//                 : E.left(error);
//         }

// const parseDeclareFunctionDeclaration =
//     (node: FunctionDeclaration) =>
//         ({ symbol, tags }: { symbol: Symbol, tags: RONEA.ReadonlyNonEmptyArray<JSDocTag> }): ParseResult<SymbolDef> => {
//             const makeError = makeParseError(node)
//             const head = RONEA.head(tags);
//             switch (head.getTagName()) {
//                 case 'event':
//                     return isVoidLike(node.getReturnType())
//                         ? E.right(new EventSymbolDef(symbol, head.getCommentText() ?? symbol.getName(), node.getParameters()))
//                         : E.left(makeError('event functions cannot have return values'));
//                 case 'methodToken':
//                     return pipe(head,
//                         parseMethodToken(node),
//                         E.map(token => new MethodTokenSymbolDef(symbol, token)));
//                 case 'operation':
//                     return pipe(tags,
//                         ROA.filter(t => t.getTagName() === 'operation'),
//                         ROA.map(flow(
//                             t => t.getCommentText(),
//                             E.fromNullable(makeError("missing operation JSDoc tag comment")),
//                             E.chain($parseOperation(node)),
//                         )),
//                         ROA.sequence(E.Applicative),
//                         E.map(ops => new OperationsSymbolDef(symbol, ops))
//                     )
//                 case 'syscall':
//                     return E.right(new SysCallSymbolDef(symbol, head.getCommentText() ?? ""));
//                 default:
//                     return E.left(makeError(`invalid function declaration tag ${head.getTagName()}`));
//             }
//         }

// const parseInterfaceDeclaration =
//     (symbol?: Symbol) =>
//         (node: InterfaceDeclaration): ParseResult<SymbolDef> =>
//             pipe(
//                 node,
//                 parseSymbol(symbol),
//                 E.map(s => new InterfaceSymbolDef(s, node))
//             );


// const parseFunctionDeclaration = (symbol?: Symbol) =>
//     (create: (node: FunctionDeclaration, symbol: Symbol) => SymbolDef) =>
//         (node: FunctionDeclaration): ParseResult<SymbolDef> =>
//             node.hasDeclareKeyword()
//                 ? pipe(
//                     node.getJsDocs(),
//                     ROA.head,
//                     O.chain(d => pipe(d.getTags(), RONEA.fromArray)),
//                     E.fromOption(() =>
//                         makeParseError(node)('declared functions must have a JSDoc block tag')),
//                     E.bindTo('tags'),
//                     E.bind('symbol', () => pipe(node, parseSymbol(symbol))),
//                     E.chain(parseDeclareFunctionDeclaration(node))
//                 )
//                 : pipe(node,
//                     parseSymbol(symbol),
//                     E.map(symbol => create(node, symbol))
//                 );

// const parseImportSpecifier =
//     (exportMap: ReadonlyMap<string, ExportedDeclarations[]>) =>
//         (node: ImportSpecifier): ParseResult<SymbolDef> => {
//             const $makeError = makeParseError(node);

//             return pipe(
//                 node.getSymbol(),
//                 E.fromNullable($makeError("missing symbol")),
//                 E.bindTo("symbol"),
//                 E.bind('name', ({ symbol }) => pipe(
//                     symbol.getAliasedSymbol(),
//                     O.fromNullable,
//                     O.getOrElse(() => symbol),
//                     ($symbol) => $symbol.getName(),
//                     E.right
//                 ) as ParseResult<string>),
//                 E.bind('decl', ({ name }) => pipe(exportMap.get(name),
//                     E.fromNullable($makeError(`missing export ${name}`)),
//                     E.chain(decls => decls.length === 1
//                         ? E.right(decls[0])
//                         : E.left($makeError(`multiple exported declarations ${name} not implemented`))
//                     ),
//                 )),
//                 E.chain(({ symbol, decl: node }) => {
//                     if (Node.isFunctionDeclaration(node))
//                         return pipe(
//                             node,
//                             parseFunctionDeclaration(symbol)(FunctionSymbolDef.create(true))
//                         );
//                     if (Node.isVariableDeclaration(node))
//                         return pipe(
//                             node,
//                             parseVariableDeclaration(symbol)
//                         );
//                     if (Node.isInterfaceDeclaration(node))
//                         return pipe(
//                             node, parseInterfaceDeclaration(symbol)
//                         );
//                     return E.left(makeParseError(node)(`parseImportSpecifier ${node.getKindName()}`));
//                 })
//             );
//         }

// const parseImportDeclaration =
//     (node: ImportDeclaration): ParseResult<ReadonlyArray<SymbolDef>> => {
//         return pipe(
//             node.getModuleSpecifierSourceFile(),
//             E.fromNullable(makeParseError(node)(`getModuleSpecifierSourceFile failed`)),
//             E.map(src => src.getExportedDeclarations()),
//             E.bindTo("exportMap"),
//             E.bind("imports", () => E.right(node.getNamedImports())),
//             E.chain(({ exportMap, imports }) =>
//                 pipe(
//                     imports,
//                     ROA.map(parseImportSpecifier(exportMap)),
//                     ROA.sequence(E.Applicative),
//                 )
//             ),
//         );
//     }

// export const parseSourceFile =
//     (src: SourceFile): CompilerState<ReadonlyArray<SymbolDef>> =>
//         (diagnostics: ReadonlyArray<Diagnostic>) => {
//             const diagnosticsSG = ROA.getSemigroup<Diagnostic>();

//             if (src.isDeclarationFile()) {
//                 const diag = $createDiagnostic(
//                     `${src.getFilePath()} is a declaration file`,
//                     {
//                         category: DiagnosticCategory.Warning,
//                         node: src
//                     });

//                 diagnostics = diagnosticsSG.concat(diagnostics, [diag]);
//                 return [[], diagnostics];
//             }

//             const { left: errors, right: defs } = pipe(
//                 src.forEachChildAsArray(),
//                 ROA.map(node => {
//                     if (Node.isFunctionDeclaration(node))
//                         return pipe(
//                             node,
//                             parseFunctionDeclaration()(FunctionSymbolDef.create(false)),
//                             E.map(ROA.of)
//                         );
//                     if (Node.isImportDeclaration(node))
//                         return parseImportDeclaration(node);
//                     if (Node.isVariableStatement(node))
//                         return parseVariableStatement(node);
//                     if (Node.isInterfaceDeclaration(node))
//                         return pipe(
//                             node,
//                             parseInterfaceDeclaration(),
//                             E.map(ROA.of)
//                         );
//                     if (node.getKind() == SyntaxKind.EndOfFileToken)
//                         return E.right([]);
//                     return E.left(makeParseError(node)(`parseSourceFileSymbols ${node.getKindName()}`));
//                 }),
//                 ROA.separate
//             );

//             diagnostics = diagnosticsSG.concat(
//                 diagnostics,
//                 errors.map(createDiagnostic)
//             );

//             return [
//                 pipe(defs, M.concatAll(ROA.getMonoid<SymbolDef>())),
//                 diagnostics
//             ];
//         }

// export const parseProjectSymbols =
//     (prj: Project): CompilerState<ReadonlyArray<ReadonlyArray<SymbolDef>>> =>
//         (diagnostics: ReadonlyArray<Diagnostic>) => {

//             const sourceSymbols = pipe(
//                 prj.getSourceFiles(),
//                 ROA.filter(s => !s.isDeclarationFile()),
//                 ROA.map(parseSourceFile),
//             )

//             return S.sequenceArray(sourceSymbols)(diagnostics);
//         }
