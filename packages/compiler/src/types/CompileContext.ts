import { sc } from "@cityofzion/neon-core";
import * as tsm from "ts-morph";
import { DebugMethodInfo } from "./DebugInfo";
import { Immutable } from "../utility/Immutable";
import { Instruction } from "./Instruction";

export type DefineSymbolFunction<T extends SymbolDefinition> = (scope: Scope) => T;

export interface Scope {
    readonly name: string;
    readonly parentScope: Scope | undefined;
    getSymbols(): IterableIterator<SymbolDefinition>;
    define<T extends SymbolDefinition>(factory: T | DefineSymbolFunction<T>): T;
    resolve(symbol: tsm.Symbol): SymbolDefinition | undefined;
}

export interface SymbolDefinition {
    readonly symbol: tsm.Symbol;
    readonly parentScope: Scope;
}

export interface CompileOptions {
    project: tsm.Project;
    addressVersion?: number;
    inline?: boolean;
    optimize?: boolean;
}

export interface CompileContext {
    readonly project: tsm.Project,
    readonly options: Readonly<Pick<CompileOptions, 'addressVersion' | 'inline' | 'optimize'>>
    readonly globals: Scope,
    readonly diagnostics: Array<tsm.ts.Diagnostic>,
    readonly operations: Array<OperationInfo>,
    
    name?: string,
    artifacts?: CompileArtifacts
}

export interface CompileResults {
    readonly diagnostics: ReadonlyArray<tsm.ts.Diagnostic>,
    readonly artifacts?: Immutable<CompileArtifacts>,
    readonly context: Immutable<Omit<CompileContext, 'diagnostics' | 'artifacts'>>
}

export interface CompileArtifacts {
    nef: sc.NEF,
    manifest: sc.ContractManifest,
    methods: Array<DebugMethodInfo>
}

export interface OperationInfo {
    readonly node: tsm.FunctionDeclaration,
    readonly instructions: ReadonlyArray<Instruction | tsm.Node>,
}