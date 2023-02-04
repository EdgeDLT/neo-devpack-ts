
// // Typescript implementation of ContractType from Debug Info v2 (https://github.com/neo-project/proposals/pull/151)
// // Port of C# ContractType implementation from https://github.com/ngdenterprise/neo-blockchaintoolkit-library/blob/develop/src/bctklib/models/ContractTypes.cs

// import { Lazy } from "../utility/Lazy";

// export const enum ContractTypeKind {
//     Unspecified,
//     Primitive,
//     Struct,
//     Array,
//     Map,
//     Interop
// }

// export interface ContractType {
//     readonly kind: ContractTypeKind
// }

// export function isUnspecified(type: ContractType) {
//     return type.kind === ContractTypeKind.Unspecified;
// }

// export const unspecified: ContractType = {
//     kind: ContractTypeKind.Unspecified
// }

// export const enum PrimitiveType {
//     Boolean,
//     Integer,
//     ByteArray,
//     String,
//     Hash160,
//     Hash256,
//     PublicKey,
//     Signature,
//     Address,
// }

// export interface PrimitiveContractType extends ContractType {
//     readonly kind: ContractTypeKind.Primitive,
//     readonly type: PrimitiveType
// }

// export function isPrimitive(type: ContractType): type is PrimitiveContractType {
//     return type.kind === ContractTypeKind.Primitive;
// }

// const primitiveMap = new Lazy(() => {
//     const primitiveTypes = [
//         PrimitiveType.Boolean,
//         PrimitiveType.Integer,
//         PrimitiveType.ByteArray,
//         PrimitiveType.String,
//         PrimitiveType.Hash160,
//         PrimitiveType.Hash256,
//         PrimitiveType.PublicKey,
//         PrimitiveType.Signature,
//         PrimitiveType.Address,
//     ] as const;
//     return new Map<PrimitiveType, PrimitiveContractType>(
//         primitiveTypes
//             .map(type => [type, { kind: ContractTypeKind.Primitive, type }])
//     );
// })

// export function primitive(type: PrimitiveType): PrimitiveContractType {
//     const instance = primitiveMap.instance.get(type);
//     if (!instance) { throw new Error(`Invalid PrimitiveType ${type}`); }
//     return instance;
// }

// export interface StructContractType extends ContractType {
//     kind: ContractTypeKind.Struct,
//     readonly name: string,
//     readonly fields: ReadonlyArray<{
//         readonly name: string,
//         readonly type: ContractType
//     }>,
// }

// export function isStruct(type: ContractType): type is StructContractType {
//     return type.kind === ContractTypeKind.Struct;
// }

// export interface ArrayContractType extends ContractType {
//     kind: ContractTypeKind.Array,
//     readonly type: ContractType,
// }

// export function isArray(type: ContractType): type is ArrayContractType {
//     return type.kind === ContractTypeKind.Array;
// }

// export interface MapContractType extends ContractType {
//     readonly kind: ContractTypeKind.Map,
//     readonly keyType: PrimitiveType,
//     readonly valueType: ContractType,
// }

// export function isMap(type: ContractType): type is MapContractType {
//     return type.kind === ContractTypeKind.Map;
// }

// export interface InteropContractType extends ContractType {
//     readonly kind: ContractTypeKind.Interop,
//     readonly type: string
// }

// export function isInterop(type: ContractType): type is InteropContractType {
//     return type.kind === ContractTypeKind.Interop;
// }

// export function toString(type: ContractType | PrimitiveType): string {
//     if (typeof type !== 'object') {
//         switch (type) {
//             case PrimitiveType.Address: return "#Address";
//             case PrimitiveType.Boolean: return "#Boolean";
//             case PrimitiveType.ByteArray: return "#ByteArray";
//             case PrimitiveType.Hash160: return "#Hash160";
//             case PrimitiveType.Hash256: return "#Hash256";
//             case PrimitiveType.Integer: return "#Integer";
//             case PrimitiveType.PublicKey: return "#PublicKey";
//             case PrimitiveType.Signature: return "#Signature";
//             case PrimitiveType.String: return "#String";
//             default: throw new Error(`unknown PrimitiveType ${type}`);
//         }
//     } else {
//         switch (type.kind) {
//             case ContractTypeKind.Array: {
//                 const aType = type as ArrayContractType;
//                 return `#Array<${toString(aType.type)}>`;
//             }
//             case ContractTypeKind.Interop: {
//                 const iType = type as InteropContractType;
//                 return `#Interop<${iType.type}>`;
//             }
//             case ContractTypeKind.Map: {
//                 const mType = type as MapContractType;
//                 return `#Map<${toString(mType.keyType)}:${toString(mType.valueType)}>`;
//             }
//             case ContractTypeKind.Primitive: {
//                 return toString((type as PrimitiveContractType).type);
//             }
//             // case ContractTypeKind.Struct: return "";
//             case ContractTypeKind.Unspecified: return "#Unspecified";
//             default: throw new Error(`${type.kind} not supported`);
//         }
//     }

// }