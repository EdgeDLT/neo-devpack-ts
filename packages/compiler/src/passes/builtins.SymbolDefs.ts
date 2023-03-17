import * as tsm from "ts-morph";
import { pipe } from "fp-ts/lib/function";
import * as E from "fp-ts/Either";
import * as ROA from 'fp-ts/ReadonlyArray';
import * as ROR from 'fp-ts/ReadonlyRecord';
import * as O from 'fp-ts/Option';
import { CallableSymbolDef, ObjectSymbolDef, ParseArgumentsFunc, SymbolDef } from "../types/ScopeType";
import { Operation } from "../types/Operation";
import { $SymbolDef } from "../symbolDef";
import { parseArguments } from "./expressionProcessor";

export function checkErrors(errorMessage: string) {
    return <T>(results: readonly E.Either<string, T>[]): readonly T[] => {
        const { left: errors, right: values } = pipe(results, ROA.separate);
        if (errors.length > 0)
            throw new Error(`${errorMessage}: ${errors.join()}`);

        return values;
    };
}

function rorValues<K extends string, A>(r: Readonly<Record<K, A>>) {
    return pipe(r, ROR.toEntries, ROA.map(t => t[1]));
}

export class BuiltInSymbolDef extends $SymbolDef {
    constructor(
        node: tsm.Node,
        readonly loadOps: readonly Operation[]
    ) {
        super(node);
    }
}

export function createBuiltInSymbol(node: tsm.Node, loadOps?: readonly Operation[]) {
    return new BuiltInSymbolDef(
        node,
        loadOps ?? []);
}

type MemberedNode = tsm.TypeElementMemberedNode & { getSymbol(): tsm.Symbol | undefined };

const getMember = (name: string)=> (decl: tsm.TypeElementMemberedNode) => {
    return pipe(
        decl.getMembers(),
        ROA.findFirst(m => m.getSymbol()?.getName() === name),
        E.fromOption(() => name)
    )
}

export function parseBuiltInSymbols(decl: MemberedNode) {
    return (props: Record<string, ReadonlyArray<Operation>>): readonly SymbolDef[] => {

        return pipe(
            props,
            ROR.mapWithIndex((key, value) => {
                return pipe(
                    decl,
                    getMember(key),
                    E.map(sig => createBuiltInSymbol(sig, value))
                );
            }),
            rorValues,
            checkErrors(`unresolved ${decl.getSymbol()?.getName()} properties`)

        );
    };
}

export class BuiltInObjectDef extends $SymbolDef implements ObjectSymbolDef {

    constructor(
        node: tsm.Node,
        readonly loadOps: readonly Operation[],
        readonly props: readonly SymbolDef[],
    ) {
        super(node);
    }
}

export interface BuiltInObjectOptions {
    readonly loadOps?: readonly Operation[],
    readonly props?: readonly SymbolDef[],
}

export function createBuiltInObject(node: tsm.Node, options: BuiltInObjectOptions) {
    return new BuiltInObjectDef(
        node,
        options.loadOps ?? [],
        options.props ?? []);
}

export function parseBuiltInObject(decl: MemberedNode) {
    return (props: Record<string, BuiltInObjectOptions>): readonly SymbolDef[] => {

        return pipe(
            props,
            ROR.mapWithIndex((key, value) => {
                return pipe(
                    decl,
                    getMember(key),
                    E.map(sig => createBuiltInObject(sig, value))
                );
            }),
            rorValues,
            checkErrors(`unresolved ${decl.getSymbol()?.getName()} objects`)
        );
    };
}

export class BuiltInCallableDef extends $SymbolDef implements CallableSymbolDef {

    constructor(
        node: tsm.Node,
        readonly loadOps: readonly Operation[],
        readonly props: readonly SymbolDef[],
        readonly parseArguments: ParseArgumentsFunc,
    ) {
        super(node);
    }
}

export interface BuiltInCallableOptions extends BuiltInObjectOptions {
    readonly parseArguments?: ParseArgumentsFunc;
}

export function createBuiltInCallable(node: tsm.Node, options: BuiltInCallableOptions) {
    return new BuiltInCallableDef(
        node,
        options.loadOps ?? [],
        options.props ?? [],
        options.parseArguments ?? parseArguments);
}


export function parseBuiltInCallables(decl: MemberedNode) {
    return (props: Record<string, BuiltInCallableOptions>): readonly SymbolDef[] => {

        const q = decl.getMembers();
        q[0].getSymbol()?.getName();
        
        return pipe(
            props,
            ROR.mapWithIndex((key, value) => {
                return pipe(
                    decl,
                    getMember(key),
                    E.map(sig => createBuiltInCallable(sig, value))
                );
            }),
            rorValues,
            checkErrors(`unresolved ${decl.getSymbol()?.getName()} functions`)
        );
    };
}


// export function parseBuiltInSymbol(decl: tsm.InterfaceDeclaration) {
//     return (props: Record<string, ReadonlyArray<Operation>>): readonly SymbolDef[] => {

//         return pipe(
//             props,
//             ROR.mapWithIndex((key, value) => {
//                 return pipe(
//                     decl.getProperty(key),
//                     E.fromNullable(key),
//                     E.map(sig => new BuiltInSymbolDef(sig, value))
//                 );
//             }),
//             rorValues,
//             checkErrors(`unresolved ${decl.getSymbol()?.getName()} properties`)

//         );
//     };
// }








// export type BuiltInSymbolMap = Record<string, ReadonlyArray<Operation>>;


// export function parseProps(decl: tsm.InterfaceDeclaration) {
//     return (props: Record<string, ReadonlyArray<Operation>>): readonly SymbolDef[] => {

//         return pipe(
//             props,
//             ROR.mapWithIndex((key, value) => {
//                 return pipe(
//                     decl.getProperty(key),
//                     E.fromNullable(key),
//                     E.map(sig => new BuiltInSymbolDef(sig, value))
//                 );
//             }),
//             rorValues,
//             checkErrors(`unresolved ${decl.getSymbol()?.getName()} properties`)

//         );
//     };
// }

// export class StaticMethodDef extends $SymbolDef implements CallableSymbolDef {
//     readonly loadOps = [];
//     readonly props = [];
//     constructor(
//         readonly sig: tsm.MethodSignature,
//         readonly parseArguments: ParseArgumentsFunc
//     ) {
//         super(sig);
//     }
// }

// export function parseStaticMethods(decl: tsm.InterfaceDeclaration) {
//     return (methods: Record<string, ParseArgumentsFunc>): readonly SymbolDef[] => {
//         return pipe(
//             methods,
//             ROR.mapWithIndex((key, value) => pipe(
//                 decl.getMethod(key),
//                 O.fromNullable,
//                 O.map(sig => new StaticMethodDef(sig, value)),
//                 E.fromOption(() => key)
//             )),
//             rorValues,
//             checkErrors(`unresolved ${decl.getSymbol()?.getName()} methods`)
//         );
//     };
// }

// class InstanceMethodDef extends $SymbolDef implements CallableSymbolDef {
//     readonly props = [];

//     constructor(
//         readonly sig: tsm.MethodSignature,
//         readonly loadOps: readonly Operation[],
//         readonly parseArguments: ParseArgumentsFunc
//     ) {
//         super(sig);
//     }
// }

// export function parseInstanceMethods(decl: tsm.InterfaceDeclaration) {
//     return (methods: Record<string, [ReadonlyArray<Operation>, ParseArgumentsFunc]>): readonly SymbolDef[] => {
//         return pipe(
//             methods,
//             ROR.mapWithIndex((key, [loadOps, parseArgs]) => pipe(
//                 decl.getMethod(key),
//                 O.fromNullable,
//                 O.map(sig => new InstanceMethodDef(sig, loadOps, parseArgs)),
//                 E.fromOption(() => key)
//             )),
//             rorValues,
//             checkErrors(`unresolved ${decl.getSymbol()?.getName()} methods`)
//         );
//     };
// }


// export function makeObjectSymbolDef(node: tsm.Node, props?: readonly SymbolDef[], loadOps?: readonly Operation[]): ObjectSymbolDef {
//     return new BuiltInObjectDef(node, loadOps ?? [], props ?? [],);
// }