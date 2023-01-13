import * as tsm from "ts-morph";
import { CompileError } from "./compiler";
import { ReadonlyUint8Array } from "./utility/ReadonlyArrays";
import { getConstantValue } from "./utils";

export interface Scope {
    readonly parentScope: Scope | undefined;
    resolve(symbol: tsm.Symbol): SymbolDef | undefined;
}

export interface SymbolDef {
    readonly symbol: tsm.Symbol;
    readonly parentScope: Scope;
}

function resolve(map: ReadonlyMap<tsm.Symbol, SymbolDef>, symbol: tsm.Symbol, parent?: Scope) {
    const symbolDef = map.get(symbol);
    return symbolDef ?? parent?.resolve(symbol);
}

function define<T extends SymbolDef>(scope: Scope, map: Map<tsm.Symbol, SymbolDef>, factory: T | ((scope: Scope) => T)): T {
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

    resolve(symbol: tsm.Symbol): SymbolDef | undefined {
        return resolve(this.map, symbol);
    }

    define<T extends SymbolDef>(factory: T | ((scope: Scope) => T)): T {
        return define(this, this.map, factory);
    }
}

export class ConstantSymbolDef implements SymbolDef {
    constructor(
        readonly symbol: tsm.Symbol,
        readonly parentScope: Scope,
        readonly value: boolean | bigint | null | ReadonlyUint8Array,
    ) {
    }
}

export class ParameterSymbolDef implements SymbolDef {
    readonly symbol: tsm.Symbol;
    constructor(
        readonly node: tsm.ParameterDeclaration,
        readonly parentScope: Scope,
        readonly index: number
    ) {
        this.symbol = node.getSymbolOrThrow();
    }
}

export class FunctionSymbolDef implements SymbolDef, Scope {
    private readonly map = new Map<tsm.Symbol, SymbolDef>();
    readonly symbol: tsm.Symbol;

    constructor(
        readonly node: tsm.FunctionDeclaration,
        readonly parentScope: Scope,
    ) {
        this.symbol = node.getSymbolOrThrow();

        const params = node.getParameters();
        const paramsLength = params.length;
        for (let index = 0; index < paramsLength; index++) {
            define(this, this.map, s => new ParameterSymbolDef(params[index], s, index));
        }
    }

    resolve(symbol: tsm.Symbol): SymbolDef | undefined {
        return resolve(this.map, symbol, this.parentScope);
    }
}

// export class VariableSymbolDef implements SymbolDef {
//     readonly symbol: tsm.Symbol;

//     constructor(
//         readonly node: tsm.VariableDeclaration,
//         readonly parentScope: Scope,
//         readonly slotType: Exclude<SlotType, 'parameter'>,
//         readonly index: number,
//     ) {
//         this.symbol = getSymbolOrCompileError(node);
//     }
// }

// export class BlockScope implements Scope {
//     private readonly map: SymbolMap;

//     constructor(
//         readonly node: tsm.Block,
//         readonly parentScope: Scope,
//     ) {
//         this.map = new SymbolMap(this);
//     }
//     get symbolDefs() { return this.map.symbolDefs; }
//     define<T extends SymbolDef>(factory: T | ((scope: Scope) => T)): T {
//         return this.map.define(factory);
//     }
//     resolve(symbol: tsm.Symbol): SymbolDef | undefined {
//         return this.map.resolve(symbol);
//     }
// }

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
                    const symbol = decl.getSymbol();
                    if (symbol) {
                        const init = decl.getInitializer();
                        if (!init) throw new CompileError("Invalid const initializer", decl);
                        const value = getConstantValue(init);
                        globals.define(s => new ConstantSymbolDef(symbol, s, value));
                    }
                }
            }
        });
    }
    return globals;
}