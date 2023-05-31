import 'mocha';
import { expect } from 'chai';
import * as tsm from 'ts-morph';

import { identity, pipe } from 'fp-ts/function';
import * as E from 'fp-ts/Either';
import * as ROA from 'fp-ts/ReadonlyArray';
import { parseExpression } from '../src/passes/expressionProcessor';
import { CompileTimeObject, CompileTimeType, InvokeResolver, createEmptyScope } from '../src/types/CompileTimeObject';
import { createPropResolver, createPropResolvers, createTestProject, createTestScope, createTestVariable, expectPushData, makeFunctionInvoker as createFunctionInvoker, testParseExpression, expectPushInt } from "./testUtils.spec";
import { isArray, makeParseError } from '../src/utils';
import { Operation } from '../src/types/Operation';

describe("expression parser", () => {
    describe("literals", () => {

        function testLiteral(contract: string) {
            const { sourceFile } = createTestProject(contract);
            const init = sourceFile.getVariableDeclarationOrThrow('$VAR').getInitializerOrThrow();
            return testParseExpression(init);
        }

        it("string literal", () => {
            const contract = /*javascript*/ `const $VAR = "Hello, World!";`;
            const result = testLiteral(contract);

            expect(result).lengthOf(1);
            expectPushData(result[0], "Hello, World!");
        });

        it("boolean literal", () => {
            const contract = /*javascript*/ `const $VAR = true;`;
            const result = testLiteral(contract);

            expect(result).lengthOf(1);
            expect(result[0]).has.property('kind', 'pushbool');
            expect(result[0]).has.property('value', true);
        });

        it("null literal", () => {
            const contract = /*javascript*/ `const $VAR = null;`;
            const result = testLiteral(contract);

            expect(result).lengthOf(1);
            expect(result[0]).has.property('kind', 'pushnull');
        });

        it("numeric literal", () => {
            const contract = /*javascript*/ `const $VAR = 42;`;
            const result = testLiteral(contract);

            expect(result).lengthOf(1);
            expectPushInt(result[0], 42);
        });

        it("bigint literal", () => {
            const contract = /*javascript*/ `const $VAR = 108446744073709551616n;`;
            const result = testLiteral(contract);

            expect(result).lengthOf(1);
            expectPushInt(result[0], 108446744073709551616n);
        });

        it("invalid numeric literal", () => {
            const contract = /*javascript*/ `const $VAR = 1.234;`;
            const { sourceFile } = createTestProject(contract);
            const init = sourceFile.getVariableDeclarationOrThrow('$VAR').getInitializerOrThrow();

            const result = pipe(
                init,
                parseExpression(createEmptyScope()),
                E.match(
                    identity,
                    () => expect.fail("Expected parse error")
                )
            );
            expect(result.node).to.equal(init);
        });

        it("array literal", () => {
            const contract = /*javascript*/ `const $VAR = [10,20,30,40,50];`;
            const result = testLiteral(contract);

            expect(result).lengthOf(7);
            expectPushInt(result[0], 10);
            expectPushInt(result[1], 20);
            expectPushInt(result[2], 30);
            expectPushInt(result[3], 40);
            expectPushInt(result[4], 50);
            expectPushInt(result[5], 5);
            expect(result[6]).deep.equals({ kind: 'packarray' });
        });

        describe("object literal", () => {
            it("property", () => {
                const contract = /*javascript*/ `const $VAR = { a: 10, b:20 };`;
                const result = testLiteral(contract);

                expect(result).lengthOf(6);
                expectPushInt(result[0], 10);
                expectPushData(result[1], "a");
                expectPushInt(result[2], 20);
                expectPushData(result[3], "b");
                expectPushInt(result[4], 2);
                expect(result[5]).deep.equals({ kind: 'packmap' });
            });

            it("shorthand property", () => {
                const contract = /*javascript*/ `const a = 10; const b = 20; const $VAR = { a, b };`;
                const { sourceFile } = createTestProject(contract);

                const a = sourceFile.getVariableDeclarationOrThrow('a');
                const aCTO = createTestVariable(a);
                const b = sourceFile.getVariableDeclarationOrThrow('b');
                const bCTO = createTestVariable(b);
                const scope = createTestScope(undefined, [aCTO, bCTO])

                const init = sourceFile.getVariableDeclarationOrThrow('$VAR').getInitializerOrThrow();
                const result = testParseExpression(init, scope);

                expect(result).lengthOf(6);
                expect(result[0]).equals(aCTO.loadOp);
                expectPushData(result[1], "a");
                expect(result[2]).equals(bCTO.loadOp);
                expectPushData(result[3], "b");
                expectPushInt(result[4], 2);
                expect(result[5]).deep.equals({ kind: 'packmap' });
            });
        })

    });

    describe("identifier", () => {
        it("load", () => {
            const contract = /*javascript*/`const $hello = 42; const $VAR = $hello;`;
            const { sourceFile } = createTestProject(contract);

            const hello = sourceFile.getVariableDeclarationOrThrow('$hello');
            const helloCTO = createTestVariable(hello);
            const scope = createTestScope(undefined, helloCTO)

            const init = sourceFile.getVariableDeclarationOrThrow('$VAR').getInitializerOrThrow();
            const result = testParseExpression(init, scope);

            expect(result).lengthOf(1);
            expect(result[0]).equals(helloCTO.loadOp);
        });

        it("store", () => {
            const contract = /*javascript*/`let $hello: number; $hello = 42;`;
            const { sourceFile } = createTestProject(contract);

            const hello = sourceFile.getVariableDeclarationOrThrow('$hello');
            const helloCTO = createTestVariable(hello);
            const scope = createTestScope(undefined, helloCTO);

            const node = sourceFile.forEachChildAsArray()[1].asKindOrThrow(tsm.SyntaxKind.ExpressionStatement);
            const result = testParseExpression(node.getExpression(), scope);

            expect(result).lengthOf(3);
            expectPushInt(result[0], 42);
            expect(result[1]).deep.equals({ kind: 'duplicate' });
            expect(result[2]).equals(helloCTO.storeOp);
        });
    });

    it("conditional", () => {
        const contract = /*javascript*/`const $VAR = true ? 42 : 0;`;
        const { sourceFile } = createTestProject(contract);

        const init = sourceFile.getVariableDeclarationOrThrow('$VAR').getInitializerOrThrow();
        const result = testParseExpression(init);

        expect(result).lengthOf(7);
        expect(result[0]).deep.equals({ kind: 'pushbool', value: true });
        expect(result[1]).deep.equals({ kind: 'jumpifnot', target: result[4] });
        expectPushInt(result[2], 42);
        expect(result[3]).deep.equals({ kind: 'jump', target: result[6] });
        expect(result[4]).deep.equals({ kind: 'noop', });
        expectPushInt(result[5], 0);
        expect(result[6]).deep.equals({ kind: 'noop', });
    })

    describe("postfix unary", () => {

        function testExpresion(contract: string, kind: string) {
            const { sourceFile } = createTestProject(contract);

            const hello = sourceFile.getVariableDeclarationOrThrow('$hello');
            const helloCTO = createTestVariable(hello);
            const scope = createTestScope(undefined, helloCTO);

            const node = sourceFile.forEachChildAsArray()[1].asKindOrThrow(tsm.SyntaxKind.ExpressionStatement);
            const result = testParseExpression(node.getExpression(), scope);

            expect(result).lengthOf(4);
            expect(result[0]).equals(helloCTO.loadOp);
            expect(result[1]).deep.equals({ kind: 'duplicate' });
            expect(result[2]).deep.equals({ kind });
            expect(result[3]).equals(helloCTO.storeOp);
        }

        it("increment", () => { testExpresion(/*javascript*/`let $hello = 42; $hello++;`, 'increment') });

        it("decrement", () => { testExpresion(/*javascript*/`let $hello = 42; $hello--;`, 'decrement') });
    });

    describe.skip("prefix unary", () => {
        // TODO: add tests
    });

    describe.skip("binary", () => {
        // TODO: add tests
    });

    describe("property access", () => {
        it("load object property", () => {
            const contract = /*javascript*/`const test = { value: 42 }; const $VAR = test.value;`;
            const { sourceFile } = createTestProject(contract);

            const test = sourceFile.getVariableDeclarationOrThrow('test');
            const testInit = test.getInitializerOrThrow().asKindOrThrow(tsm.SyntaxKind.ObjectLiteralExpression);
            const valueCTO = createTestVariable(testInit.getPropertyOrThrow("value"));

            const testProps = createPropResolvers(valueCTO);
            const testCTO = createTestVariable(test, { properties: testProps });
            const scope = createTestScope(undefined, testCTO);

            const init = sourceFile.getVariableDeclarationOrThrow('$VAR').getInitializerOrThrow();
            const result = testParseExpression(init, scope);

            expect(result).lengthOf(2);
            expect(result[0]).equals(testCTO.loadOp);
            expect(result[1]).equals(valueCTO.loadOp);
        });

        it("optional chaining", () => {
            const contract = /*javascript*/`const test = { value: 42 }; const $VAR = test?.value;`;
            const { sourceFile } = createTestProject(contract);

            const test = sourceFile.getVariableDeclarationOrThrow('test');
            const testInit = test.getInitializerOrThrow().asKindOrThrow(tsm.SyntaxKind.ObjectLiteralExpression);
            const valueCTO = createTestVariable(testInit.getPropertyOrThrow("value"));

            const testProps = createPropResolvers(valueCTO);
            const testCTO = createTestVariable(test, { properties: testProps });
            const scope = createTestScope(undefined, testCTO);

            const init = sourceFile.getVariableDeclarationOrThrow('$VAR').getInitializerOrThrow();
            const result = testParseExpression(init, scope);

            expect(result).lengthOf(6);
            expect(result[0]).equals(testCTO.loadOp);
            expect(result[1]).equals(valueCTO.loadOp);
            expect(result[2]).deep.equals({ kind: "duplicate" });
            expect(result[3]).deep.equals({ kind: "isnull" });
            expect(result[4]).has.property("kind", "jumpif");
            expect(result[4]).has.property("target", result[5]);
            expect(result[5]).deep.equals({ kind: "noop" });
        });

        it("load type property", () => {
            const contract = /*javascript*/`
                interface Test { value: number; }
                const test:Test = null!;
                const $VAR = test.value;`;
            const { sourceFile } = createTestProject(contract);

            const iTest = sourceFile.getInterfaceOrThrow('Test');
            const iTestType = iTest.getType();
            const value = iTestType.getPropertyOrThrow('value');
            const valueCTO = createTestVariable(value.getValueDeclarationOrThrow());
            const iTestProps = new Map([[value, createPropResolver(valueCTO)]])
            const iTestCTT: CompileTimeType = { type: iTestType, properties: iTestProps };

            const test = sourceFile.getVariableDeclarationOrThrow('test');
            const testCTO = createTestVariable(test);
            const scope = createTestScope(undefined, testCTO, iTestCTT);

            const init = sourceFile.getVariableDeclarationOrThrow('$VAR').getInitializerOrThrow();
            const result = testParseExpression(init, scope);

            expect(result).lengthOf(2);
            expect(result[0]).equals(testCTO.loadOp);
            expect(result[1]).equals(valueCTO.loadOp);
        });

        it("store object property", () => {
            const contract = /*javascript*/`const test = { value: 42 }; test.value = 42;`;
            const { sourceFile } = createTestProject(contract);

            const test = sourceFile.getVariableDeclarationOrThrow('test');
            const testInit = test.getInitializerOrThrow().asKindOrThrow(tsm.SyntaxKind.ObjectLiteralExpression);
            const valueCTO = createTestVariable(testInit.getPropertyOrThrow("value"));

            const testProps = createPropResolvers(valueCTO);
            const testCTO = createTestVariable(test, { properties: testProps });
            const scope = createTestScope(undefined, testCTO);

            const init = sourceFile.forEachChildAsArray()[1].asKindOrThrow(tsm.SyntaxKind.ExpressionStatement).getExpression();
            const result = testParseExpression(init, scope);

            expect(result).lengthOf(4);
            expectPushInt(result[0], 42);
            expect(result[1]).deep.equals({ kind: 'duplicate' })
            expect(result[2]).equals(testCTO.loadOp);
            expect(result[3]).equals(valueCTO.storeOp);
        });

        it("store type property", () => {
            const contract = /*javascript*/`
                interface Test { value: number; }
                const test:Test = null!;
                test.value = 42;`;
            const { sourceFile } = createTestProject(contract);

            const iTest = sourceFile.getInterfaceOrThrow('Test');
            const iTestType = iTest.getType();
            const value = iTestType.getPropertyOrThrow('value');
            const valueCTO = createTestVariable(value.getValueDeclarationOrThrow());
            const iTestProps = new Map([[value, createPropResolver(valueCTO)]])
            const iTestCTT: CompileTimeType = { type: iTestType, properties: iTestProps };

            const test = sourceFile.getVariableDeclarationOrThrow('test');
            const testCTO = createTestVariable(test);
            const scope = createTestScope(undefined, testCTO, iTestCTT);

            const init = sourceFile.forEachChildAsArray()[2].asKindOrThrow(tsm.SyntaxKind.ExpressionStatement).getExpression();
            const result = testParseExpression(init, scope);

            expect(result).lengthOf(4);
            expectPushInt(result[0], 42);
            expect(result[1]).deep.equals({ kind: 'duplicate' })
            expect(result[2]).equals(testCTO.loadOp);
            expect(result[3]).equals(valueCTO.storeOp);
        });
    })

    describe.skip("constructor", () => {
        // TODO: add tests
    })

    describe("call", () => {
        it("function", () => { 
            const contract = /*javascript*/`function test(a: number, b: string) { return 42; } const $VAR = test(42, "hello");`;
            const { sourceFile } = createTestProject(contract);

            const test = sourceFile.getFunctionOrThrow('test');
            const testCallOp = { kind: 'noop', debug: 'test.call' } as Operation;
            const testCTO = createTestVariable(test, { call: createFunctionInvoker(test, testCallOp)});
            const scope = createTestScope(undefined, testCTO);

            const init = sourceFile.getVariableDeclarationOrThrow('$VAR').getInitializerOrThrow();
            const result = testParseExpression(init, scope);

            expect(result).lengthOf(3);
            expectPushData(result[0], "hello");
            expectPushInt(result[1], 42);
            expect(result[2]).equals(testCallOp);
        })

        it("object method", () => { 
            const contract = /*javascript*/`
                const obj = { test(a: number, b: string) { return 42; } }; 
                const $VAR = obj.test(42, "hello");`;
            const { sourceFile } = createTestProject(contract);

            const obj = sourceFile.getVariableDeclarationOrThrow('obj');
            const objInit = obj.getInitializerOrThrow().asKindOrThrow(tsm.SyntaxKind.ObjectLiteralExpression);
            const test = objInit.getPropertyOrThrow('test');
            const testCallOp = { kind: 'noop', debug: 'test.call' } as Operation;
            const testCTO = createTestVariable(test, { call: createFunctionInvoker(test, testCallOp, true)});
            const properties = createPropResolvers(testCTO);
            const objCTO = createTestVariable(obj, { properties });
            const scope = createTestScope(undefined, objCTO);

            const init = sourceFile.getVariableDeclarationOrThrow('$VAR').getInitializerOrThrow();
            const result = testParseExpression(init, scope);

            expect(result).lengthOf(4);
            expectPushData(result[0], "hello");
            expectPushInt(result[1], 42);
            expect(result[2]).equals(objCTO.loadOp);
            expect(result[3]).equals(testCallOp);
        })

        it("object static method", () => { 
            const contract = /*javascript*/`
                const obj = { test(a: number, b: string) { return 42; } }; 
                const $VAR = obj.test(42, "hello");`;
            const { sourceFile } = createTestProject(contract);

            const obj = sourceFile.getVariableDeclarationOrThrow('obj');
            const objInit = obj.getInitializerOrThrow().asKindOrThrow(tsm.SyntaxKind.ObjectLiteralExpression);
            const test = objInit.getPropertyOrThrow('test');
            const testCallOp = { kind: 'noop', debug: 'test.call' } as Operation;
            const testCTO = createTestVariable(test, { call: createFunctionInvoker(test, testCallOp, false)});
            const properties = createPropResolvers(testCTO);
            const objCTO = createTestVariable(obj, { properties });
            const scope = createTestScope(undefined, objCTO);

            const init = sourceFile.getVariableDeclarationOrThrow('$VAR').getInitializerOrThrow();
            const result = testParseExpression(init, scope);

            expect(result).lengthOf(3);
            expectPushData(result[0], "hello");
            expectPushInt(result[1], 42);
            expect(result[2]).equals(testCallOp);
        })

        it("type method", () => { 
            const contract = /*javascript*/`
                interface Test { do(a: number, b: string): number; }
                const obj:Test = null!;
                const $VAR = obj.do(42, "hello");`;
            const { sourceFile } = createTestProject(contract);

            const iTest = sourceFile.getInterfaceOrThrow('Test');
            const iTestType = iTest.getType();
            const doProp = iTestType.getPropertyOrThrow('do');
            const doDecl = doProp.getValueDeclarationOrThrow();
            const doCallOp = { kind: 'noop', debug: 'do.call' } as Operation;
            const doCTO = createTestVariable(doDecl, { call: createFunctionInvoker(doDecl, doCallOp, true)});
            const iTestProps = new Map([[doProp, createPropResolver(doCTO)]])
            const iTestCTT: CompileTimeType = { type: iTestType, properties: iTestProps };

            const obj = sourceFile.getVariableDeclarationOrThrow('obj');
            const objCTO = createTestVariable(obj);
            const scope = createTestScope(undefined, objCTO, iTestCTT);

            const init = sourceFile.getVariableDeclarationOrThrow('$VAR').getInitializerOrThrow();
            const result = testParseExpression(init, scope);

            expect(result).lengthOf(4);
            expectPushData(result[0], "hello");
            expectPushInt(result[1], 42);
            expect(result[2]).equals(objCTO.loadOp);
            expect(result[3]).equals(doCallOp);
        })

        
        it("type static method", () => { 
            const contract = /*javascript*/`
                interface Test { do(a: number, b: string): number; }
                const obj:Test = null!;
                const $VAR = obj.do(42, "hello");`;
            const { sourceFile } = createTestProject(contract);

            const iTest = sourceFile.getInterfaceOrThrow('Test');
            const iTestType = iTest.getType();
            const doProp = iTestType.getPropertyOrThrow('do');
            const doDecl = doProp.getValueDeclarationOrThrow();
            const doCallOp = { kind: 'noop', debug: 'do.call' } as Operation;
            const doCTO = createTestVariable(doDecl, { call: createFunctionInvoker(doDecl, doCallOp)});
            const iTestProps = new Map([[doProp, createPropResolver(doCTO)]])
            const iTestCTT: CompileTimeType = { type: iTestType, properties: iTestProps };

            const obj = sourceFile.getVariableDeclarationOrThrow('obj');
            const objCTO = createTestVariable(obj);
            const scope = createTestScope(undefined, objCTO, iTestCTT);

            const init = sourceFile.getVariableDeclarationOrThrow('$VAR').getInitializerOrThrow();
            const result = testParseExpression(init, scope);

            expect(result).lengthOf(3);
            expectPushData(result[0], "hello");
            expectPushInt(result[1], 42);
            expect(result[2]).equals(doCallOp);
        })
    });
});