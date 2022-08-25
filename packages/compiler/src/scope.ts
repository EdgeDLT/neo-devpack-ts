import * as tsm from "ts-morph";
import { Instruction } from "./types/Instruction";
import { SlotType } from "./types/OperationBuilder";
import { ReadonlyUint8Array } from "./utility/ReadonlyArrays";
import { getConstantValue, getSymbolOrCompileError } from "./utils";

// @internal
export interface Scope {
    readonly parentScope: Scope | undefined;
    readonly symbolDefs: IterableIterator<SymbolDef>;
    define<T extends SymbolDef>(factory: T | ((scope: Scope) => T)): T;
    resolve(symbol: tsm.Symbol): SymbolDef | undefined;
}

// @internal
export interface SymbolDef {
    readonly symbol: tsm.Symbol;
    readonly parentScope: Scope;
}

// @internal
export class SymbolMap {
    private readonly map = new Map<tsm.Symbol, SymbolDef>();

    constructor(readonly scope: Scope) { }

    get symbolDefs() { return this.map.values(); }

    define<T extends SymbolDef>(factory: T | ((scope: Scope) => T)): T {
        const instance = typeof factory === 'function' ? factory(this.scope) : factory;
        if (instance.parentScope !== this.scope) {
            throw new Error(`Invalid scope for ${instance.symbol.getName()}`);
        }
        if (this.map.has(instance.symbol)) {
            throw new Error(`${instance.symbol.getName()} already defined in this scope`);
        }
        this.map.set(instance.symbol, instance);
        return instance;
    }

    resolve(symbol: tsm.Symbol): SymbolDef | undefined {
        const symbolDef = this.map.get(symbol);
        return symbolDef ?? this.scope.parentScope?.resolve(symbol);
    }
}

// @internal
export class ConstantSymbolDef implements SymbolDef {
    constructor(
        readonly symbol: tsm.Symbol,
        readonly parentScope: Scope,
        readonly value: boolean | bigint | null | ReadonlyUint8Array,
    ) {
    }
}

export class VariableSymbolDef implements SymbolDef {
    readonly symbol: tsm.Symbol;

    constructor(
        readonly node: tsm.VariableDeclaration,
        readonly parentScope: Scope,
        readonly slotType: Exclude<SlotType, 'parameter'>,
        readonly index: number,
    ) {
        this.symbol = getSymbolOrCompileError(node);
    }
}

export class ParameterSymbolDef implements SymbolDef {
    readonly symbol: tsm.Symbol;
    constructor(
        readonly node: tsm.ParameterDeclaration,
        readonly parentScope: Scope,
        readonly index: number
    ) {
        this.symbol = getSymbolOrCompileError(node);
    }
}

// @internal
export class FunctionSymbolDef implements SymbolDef, Scope {
    private instructions: ReadonlyArray<Instruction | tsm.Node> | undefined;
    private readonly map: SymbolMap;
    readonly symbol: tsm.Symbol;

    constructor(
        readonly node: tsm.FunctionDeclaration,
        readonly parentScope: Scope,
    ) {
        this.map = new SymbolMap(this);
        this.symbol = getSymbolOrCompileError(node);

        const params = node.getParameters();
        const paramsLength = params.length;
        for (let index = 0; index < paramsLength; index++) {
            this.define(s => new ParameterSymbolDef(params[index], s, index))
        }
    }

    setInstructions(instructions: IterableIterator<Instruction | tsm.Node>) {
        this.instructions = [...instructions];
    }

    get symbolDefs() { return this.map.symbolDefs; }
    define<T extends SymbolDef>(factory: T | ((scope: Scope) => T)): T {
        return this.map.define(factory);
    }
    resolve(symbol: tsm.Symbol): SymbolDef | undefined {
        return this.map.resolve(symbol);
    }
}

// @internal
export class BlockScope implements Scope {
    private readonly map: SymbolMap;

    constructor(
        readonly node: tsm.Block,
        readonly parentScope: Scope,
    ) {
        this.map = new SymbolMap(this);
    }
    get symbolDefs() { return this.map.symbolDefs; }
    define<T extends SymbolDef>(factory: T | ((scope: Scope) => T)): T {
        return this.map.define(factory);
    }
    resolve(symbol: tsm.Symbol): SymbolDef | undefined {
        return this.map.resolve(symbol);
    }
}

// @internal
export class GlobalScope implements Scope {
    private readonly map: SymbolMap;
    readonly parentScope = undefined;

    constructor() {
        this.map = new SymbolMap(this);
    }

    get symbolDefs() { return this.map.symbolDefs; }
    define<T extends SymbolDef>(factory: T | ((scope: Scope) => T)): T {
        return this.map.define(factory);
    }
    resolve(symbol: tsm.Symbol): SymbolDef | undefined {
        return this.map.resolve(symbol);
    }
}

// @internal
export function createGlobalScope(project: tsm.Project) {
    const globals = new GlobalScope();
    for (const src of project.getSourceFiles()) {
        if (src.isDeclarationFile()) continue;
        src.forEachChild(node => {
            if (tsm.Node.isFunctionDeclaration(node)) {
                globals.define(s => new FunctionSymbolDef(node, s));
            }
            else if (tsm.Node.isVariableStatement(node)
                && node.getDeclarationKind() === tsm.VariableDeclarationKind.Const
            ) {
                for (const decl of node.getDeclarations()) {
                    const value = getConstantValue(decl);
                    if (value !== undefined) {
                        const symbol = decl.getSymbol();
                        if (symbol) {
                            globals.define(s => new ConstantSymbolDef(symbol, s, value));
                        }
                    }
                }
            }
        });
    }
    return globals;
}