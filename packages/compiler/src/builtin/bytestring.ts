import * as tsm from "ts-morph";
import { flow, pipe } from "fp-ts/lib/function";
import * as E from "fp-ts/Either";
import * as O from 'fp-ts/Option'
import * as ROA from 'fp-ts/ReadonlyArray'
import * as TS from "../TS";

import { GlobalScopeContext, getVarDeclAndSymbol, makeInterface, makeMethod, makeProperties } from "./common";
import { CallInvokeResolver, CompileTimeObject, GetOpsFunc, PropertyResolver } from "../types/CompileTimeObject";
import { createDiagnostic, makeParseError, single } from "../utils";
import { Operation, isPushDataOp, isPushIntOp } from "../types/Operation";
import { sc, u } from "@cityofzion/neon-core";

function getCompileTimeString(ops: readonly Operation[]): O.Option<string> {
    return pipe(
        ops,
        ROA.filter(op => op.kind !== 'noop'),
        single,
        O.chain(O.fromPredicate(isPushDataOp)),
        O.chain(op => O.tryCatch(() => Buffer.from(op.value).toString()))
    )
}

function getCompileTimeInteger(ops: readonly Operation[]): O.Option<bigint> {
    return pipe(
        ops,
        ROA.filter(op => op.kind !== 'noop'),
        single,
        O.chain(O.fromPredicate(isPushIntOp)),
        O.map(op => op.value)
    );
}

function getFirstArg(node: tsm.Node) {
    return (args: readonly GetOpsFunc[]) => {
        return pipe(
            args,
            ROA.head,
            E.fromOption(() => makeParseError(node)("invalid arg count")),
            E.chain(arg => arg()),
        )
    }
}

const fromHex: CallInvokeResolver = (node) => (_$this, args) => {
    return pipe(
        args,
        getFirstArg(node),
        E.chain(flow(
            getCompileTimeString,
            E.fromOption(() => makeParseError(node)("fromHex requires a string literal argument"))
        )),
        E.map(str => {
            return str.startsWith("0x") || str.startsWith("0X") ? str.slice(2) : str;
        }),
        E.chain(str => {
            const value = Buffer.from(str, "hex");
            return value.length === 0 && str.length > 0
                ? E.left(makeParseError(node)("invalid hex string"))
                : E.of(value)
        }),
        E.map(value => ROA.of<Operation>({ kind: "pushdata", value })),
        E.map(loadOps => <CompileTimeObject>{ node, loadOps })
    )
};

const fromInteger: CallInvokeResolver = (node) => (_$this, args) => {
    return pipe(
        args,
        getFirstArg(node),
        E.map(ops => {
            const loadOps = pipe(ops,
                getCompileTimeInteger,
                O.match(
                    () => pipe(ops, ROA.append<Operation>({ kind: "convert", type: sc.StackItemType.ByteString })),
                    value => {
                        const twos = u.BigInteger.fromNumber(value.toString()).toReverseTwos();
                        return ROA.of<Operation>({ kind: "pushdata", value: Buffer.from(twos, 'hex') });
                    }
                )
            )
            return <CompileTimeObject>{ node, loadOps };
        })
    );
}

const fromString: CallInvokeResolver = (node) => (_$this, args) => {
    return pipe(
        args, 
        getFirstArg(node),
        E.map(loadOps =><CompileTimeObject>{ node, loadOps })
    );
}

function makeByteStringObject(ctx: GlobalScopeContext) {
    const members = { fromHex, fromInteger, fromString }

    pipe(
        "ByteString",
        getVarDeclAndSymbol(ctx),
        E.bind('properties', ({ node }) => makeProperties(node, members, makeProperty)),
        E.map(({ node, symbol, properties }) => <CompileTimeObject>{ node, symbol, loadOps: [], properties }),
        E.match(
            error => { ctx.addError(createDiagnostic(error)) },
            ctx.addObject
        )
    )

    function makeProperty(call: CallInvokeResolver) {
        return (symbol: tsm.Symbol): E.Either<string, CompileTimeObject> => {
            return pipe(
                symbol.getValueDeclaration(),
                O.fromNullable,
                O.chain(O.fromPredicate(tsm.Node.isMethodSignature)),
                E.fromOption(() => `could not find method signature for ${symbol.getName()}`),
                E.map(node => <CompileTimeObject>{ node, symbol, loadOps: [], call })
            )
        }
    }
}

function makeLength(symbol: tsm.Symbol): E.Either<string, PropertyResolver> {
    return pipe(
        symbol,
        TS.getPropSig,
        O.map(node => {
            const resolver: PropertyResolver = ($this) => pipe(
                $this(),
                E.map(ROA.append<Operation>({ kind: "size" })),
                E.map(loadOps => <CompileTimeObject>{ node: node, loadOps })
            );
            return resolver;
        }),
        E.fromOption(() => `could not find ${symbol.getName()} member`)
    )
}

const callAsInteger: CallInvokeResolver = (node) => ($this) => {
    return pipe(
        $this(),
        E.map(ROA.append<Operation>({ kind: "convert", type: sc.StackItemType.Integer })),
        E.map(loadOps => <CompileTimeObject>{ node, loadOps })
    )
};

function makeByteStringInterface(ctx: GlobalScopeContext) {
    const members = {
        length: makeLength,
        asInteger: makeMethod(callAsInteger),
    }
    makeInterface("ByteString", members, ctx);
}

export function makeByteString(ctx: GlobalScopeContext) {
    makeByteStringObject(ctx);
    makeByteStringInterface(ctx);
}