import nodeTest from "node:test";
import * as tsm from "ts-morph";
import { CompileError } from "./compiler";
import { dispatch } from "./utility/nodeDispatch";
import { ReadonlyUint8Array } from "./utility/ReadonlyArrays";
import { getConstantValue, getSymbolOrCompileError } from "./utils";

export interface ReadonlyScope {
    readonly parentScope: ReadonlyScope | undefined;
    readonly symbols: IterableIterator<SymbolDef>;
    resolve(symbol: tsm.Symbol): SymbolDef | undefined;
}

export interface Scope extends ReadonlyScope {
    define<T extends SymbolDef>(factory: T | ((scope: Scope) => T)): T;
}

export function isScope(scope: ReadonlyScope): scope is Scope {
    return 'define' in scope;
}

export interface SymbolDef {
    readonly symbol: tsm.Symbol;
    readonly parentScope: ReadonlyScope;
}

function resolve(map: ReadonlyMap<tsm.Symbol, SymbolDef>, symbol: tsm.Symbol, parent?: ReadonlyScope) {
    const symbolDef = map.get(symbol);
    return symbolDef ?? parent?.resolve(symbol);
}

function define<T extends SymbolDef>(scope: ReadonlyScope, map: Map<tsm.Symbol, SymbolDef>, factory: T | ((scope: ReadonlyScope) => T)): T {
    const instance = typeof factory === 'function' ? factory(scope) : factory;
    if (instance.parentScope !== scope) {
        throw new Error(`Invalid scope for ${instance.symbol.getName()}`);
    }
    if (map.has(instance.symbol)) {
        throw new Error(`${instance.symbol.getName()} already defined in this scope`);
    }
    map.set(instance.symbol, instance);
    return instance;
}





export class GlobalScope implements Scope {
    private readonly map = new Map<tsm.Symbol, SymbolDef>();
    readonly parentScope = undefined;

    resolve(symbol: tsm.Symbol) {
        return resolve(this.map, symbol);
    }

    define<T extends SymbolDef>(factory: T | ((scope: ReadonlyScope) => T)) {
        return define(this, this.map, factory);
    }

    get symbols(): IterableIterator<SymbolDef> {
        return this.map.values();
    }
}

export class BlockScope implements Scope {
    private readonly map = new Map<tsm.Symbol, SymbolDef>();

    constructor(
        readonly node: tsm.Block,
        readonly parentScope: ReadonlyScope,
    ) {
    }

    define<T extends SymbolDef>(factory: T | ((scope: ReadonlyScope) => T)) {
        return define(this, this.map, factory);
    }

    get symbols() {
        return this.map.values();
    }

    resolve(symbol: tsm.Symbol) {
        return resolve(this.map, symbol, this.parentScope);
    }
}













export class ConstantSymbolDef implements SymbolDef {
    constructor(
        readonly symbol: tsm.Symbol,
        readonly parentScope: ReadonlyScope,
        readonly value: boolean | bigint | null | ReadonlyUint8Array,
    ) { }
}

export class FunctionSymbolDef implements SymbolDef, ReadonlyScope {
    private readonly map = new Map<tsm.Symbol, SymbolDef>();
    readonly symbol: tsm.Symbol;

    constructor(
        readonly node: tsm.FunctionDeclaration,
        readonly parentScope: ReadonlyScope,
        symbol?: tsm.Symbol,
    ) {
        this.symbol = symbol ?? node.getSymbolOrThrow();

        const params = node.getParameters();
        for (let index = 0; index < params.length; index++) {
            define(this, this.map, s => new ParameterSymbolDef(params[index], s, index));
        }
    }

    get symbols(): IterableIterator<SymbolDef> {
        return this.map.values();
    }

    resolve(symbol: tsm.Symbol): SymbolDef | undefined {
        return resolve(this.map, symbol, this.parentScope);
    }
}

export class ParameterSymbolDef implements SymbolDef {
    readonly symbol: tsm.Symbol;
    constructor(
        readonly node: tsm.ParameterDeclaration,
        readonly parentScope: ReadonlyScope,
        readonly index: number,
    ) {
        this.symbol = node.getSymbolOrThrow();
    }
}

export class VariableSymbolDef implements SymbolDef {
    readonly symbol: tsm.Symbol;
    constructor(
        readonly node: tsm.VariableDeclaration,
        readonly parentScope: ReadonlyScope,
        readonly index: number
    ) {
        this.symbol = node.getSymbolOrThrow();
    }
}

export class EventSymbolDef implements SymbolDef {
    readonly symbol: tsm.Symbol;
    readonly name: string;

    constructor(
        readonly node: tsm.FunctionDeclaration,
        readonly parentScope: ReadonlyScope,
        tag: tsm.JSDocTag
    ) {
        if (!node.hasDeclareKeyword()) throw new CompileError("Invalid EventSymbolDef", node);
        this.symbol = node.getSymbolOrThrow();
        this.name = tag.getCommentText() ?? node.getNameOrThrow();
    }
}





































interface ScopeOptions {
    scope: Scope,
    symbol?: tsm.Symbol
}

function getEventTag(node: tsm.JSDocableNode): tsm.JSDocTag | undefined {
    for (const doc of node.getJsDocs()) {
        for (const tag of doc.getTags()) {
            if (tag.getTagName() === "event") return tag;
        }
    }
    return undefined
}

function processFunctionDeclaration(node: tsm.FunctionDeclaration, { scope, symbol }: ScopeOptions) {
    if (node.hasDeclareKeyword()) {
        const tag = getEventTag(node);
        if (tag) {
            scope.define(s => new EventSymbolDef(node, s, tag));
        } else {
            throw new CompileError("not implemented", node);
        }
    } else {
        scope.define(s => new FunctionSymbolDef(node, s, symbol));
    }
}

// function processScFxImport(decls: tsm.ExportedDeclarations[], options: ScopeOptions) {
//     if (decls.length !== 1) throw new Error('Multiple ExportedDeclarations not implemented');
//     const decl = decls[0];
//     const foo = decl.getType();




//     const i = 0;


// }

function processSCFXImportSpecifier(decls: tsm.ExportedDeclarations[], options: ScopeOptions) {
    if (decls.length !== 1) throw new Error('not implemented');
    const decl = decls[0];
    if (tsm.Node.isVariableDeclaration(decl)) {
        processVariableDeclaration(decl, options);
    }
}

function processImportDeclaration(node: tsm.ImportDeclaration, { scope }: ScopeOptions) {
    const isSCFX = node.getModuleSpecifierValue() === '@neo-project/neo-contract-framework';
    const exportMap = node.getModuleSpecifierSourceFileOrThrow().getExportedDeclarations();

    if (isSCFX) {
        for (const $import of node.getNamedImports()) {
            const symbol = $import.getSymbolOrThrow();
            const name = (symbol.getAliasedSymbol() ?? symbol).getName();
            const $export = exportMap.get(name);
            if (!$export || $export.length === 0) { throw new CompileError('not found', $import); }
            if ($export.length > 1) { throw new CompileError('not implemented', $import); }
            processSCFXImportSpecifier($export, { scope, symbol });
        }
    } else {
        throw new CompileError("not implemented", node);
    }

}

function processVariableDeclaration(node: tsm.VariableDeclaration, options: ScopeOptions) {
    const stmt = node.getVariableStatementOrThrow();
    const declKind = stmt.getDeclarationKind();
    if (declKind !== tsm.VariableDeclarationKind.Const) {
        throw new CompileError(`${declKind} not implemented`, stmt);
    }

    const symbol = options.symbol ?? node.getSymbol();
    if (symbol) {
        const init = node.getInitializer();
        if (init) {
            const value = getConstantValue(init);
            options.scope.define(s => new ConstantSymbolDef(symbol, s, value));
        } else {
            throw new CompileError("not implemented", node);
        }
    }
}

function processVariableStatement(node: tsm.VariableStatement, options: ScopeOptions) {
    for (const decl of node.getDeclarations()) {
        processVariableDeclaration(decl, options);
    }
}

function processScopeNode(node: tsm.Node, options: ScopeOptions) {
    dispatch(node, options, {
        [tsm.SyntaxKind.FunctionDeclaration]: processFunctionDeclaration,
        [tsm.SyntaxKind.ImportDeclaration]: processImportDeclaration,
        [tsm.SyntaxKind.VariableStatement]: processVariableStatement,
        [tsm.SyntaxKind.EndOfFileToken]: () => { },
    });
}

// @internal
export function createGlobalScope(src: tsm.SourceFile): ReadonlyScope {
    if (src.isDeclarationFile()) throw new CompileError(`can't createGlobalScope for declaration file`, src);

    const scope = new GlobalScope();
    src.forEachChild(node => processScopeNode(node, { scope }));
    const symbols = [...scope.symbols].map(s => s.symbol.getName());
    return scope;
}