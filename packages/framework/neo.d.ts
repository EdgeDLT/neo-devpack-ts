
// There are 9 NeoVM Types: Pointer, Boolean, Integer, ByteString, Buffer, Array, Struct, Map, InteropInterface
//  * five types have direct TS equivalents: Boolean/boolean, Integer/bigint, Buffer/Uint8Array, Array/Array, Map/Map
//  * ByteString is defined as ReadonlyUint8Array as per https://www.growingwiththeweb.com/2020/10/typescript-readonly-typed-arrays.html
//  * Pointer, Struct and InteropInterface are all TBD

declare global {
    export interface ByteString extends Omit<Uint8Array, 'copyWithin' | 'fill' | 'reverse' | 'set' | 'sort'> { }

    /**
     * @operation duplicate 
     * @operation isnull
     * @operation jumpif 3
     * @operation convert Integer 
     * @operation jump 3
     * @operation drop 
     * @operation pushint 0
     */
    export function asInteger(value: ByteString | null | undefined): bigint;

    /**
     * @operation convert ByteString
     */
    export function asByteString(value: bigint): ByteString;

    /**
     * @operation concat
     */
    export function concat(value1: ByteString, value2: ByteString): ByteString;

    export const callFlagsNone = 0;
    export const callFlagsReadStates = 1;
    export const callFlagsWriteStates = 2;
    export const callFlagsAllowCall = 4;
    export const callFlagsAllowNotify = 8;
    export const callFlagsStates = 3;
    export const callFlagsReadOnly = 5;
    export const callFlagsAll = 15

    // There are 7 interop Contract service
    // three are internal use only: CallNative, NativeOnPersist and NativePostPersist
    // one has no params: GetCallFlags
    // The rest are static methods: Call, CreateStandardAccount, CreateMultisigAccount

    // There are 2 interop Crypto services
    // both are static methods: CheckSig and CheckMultisig

    // There are 2 interop Iterator services
    // both take a single IIterator parameter: Next and Value

    // There are 18 interop Runtime services
    // 12 have no params:
    //      GetTrigger, Platform, GetScriptContainer, GetExecutingScriptHash, GetCallingScriptHash, 
    //      GetEntryScriptHash, GetTime, GetInvocationCounter, GasLeft, GetAddressVersion
    //      GetNetwork, GetRandom
    // 6 static methods: 
    //      GetNotifications, CheckWitness, Log, Notify, LoadScript, BurnGas

    export const Storage: StorageConstructor;

    export interface StorageConstructor {
        /** @syscall System.Storage.GetContext */
        readonly context: StorageContext;
        /** @syscall System.Storage.GetReadOnlyContext */
        readonly readonlyContext: ReadonlyStorageContext;
    }

    export interface ReadonlyStorageContext {
        /** @syscall System.Storage.Get */
        get(key: ByteString): ByteString | undefined;
        // /** @syscall System.Storage.Find */
        // find(prefix: ByteString, options: FindOptions): Iterator
    }

    // FindOptions
    // None = 0,                    No option is set. The results will be an iterator of (key, value).
    // KeysOnly = 1 << 0,           Indicates that only keys need to be returned. The results will be an iterator of keys.
    // RemovePrefix = 1 << 1,       Indicates that the prefix byte of keys should be removed before return.
    // ValuesOnly = 1 << 2,         Indicates that only values need to be returned. The results will be an iterator of values.
    // DeserializeValues = 1 << 3,  Indicates that values should be deserialized before return.
    // PickField0 = 1 << 4,         Indicates that only the field 0 of the deserialized values need to be returned. This flag must be set together with <see cref="DeserializeValues"/>.
    // PickField1 = 1 << 5,         Indicates that only the field 1 of the deserialized values need to be returned. This flag must be set together with <see cref="DeserializeValues"/>.

    export interface StorageContext extends ReadonlyStorageContext {
        /** @syscall System.Storage.AsReadOnly */
        readonly asReadonly: ReadonlyStorageContext;
        /** @syscall System.Storage.Put */
        put(key: ByteString, value: ByteString): void;
        /** @syscall System.Storage.Delete */
        delete(key: ByteString): void;
    }

    export const Runtime: RuntimeConstructor;

    export interface RuntimeConstructor {
        /** @syscall System.Runtime.GetScriptContainer */
        getScriptContainer(): any;
        /** @syscall System.Runtime.CheckWitness */
        checkWitness(account: ByteString): boolean;
        /** @syscall System.Contract.Call */
        callContract(scriptHash: ByteString, method: string, flags: number, ...args: any[]): any;
    }

    export const ContractManagement: ContractManagementConstructor;

    /** @nativeContract {0xfffdc93764dbaddd97c48f252a53ea4643faa3fd} */
    export interface ContractManagementConstructor {
        update(nefFile: ByteString, manifest: string, data?: any): void;
        getContract(hash: ByteString): Contract;
    }

    /** @stackitem */
    export interface Transaction {
        readonly hash: ByteString,
        readonly version: number,
        readonly nonce: number,
        readonly sender: ByteString,
        readonly systemFee: bigint,
        readonly networkFee: bigint,
        readonly validUntilBlock: number,
        readonly script: ByteString
    }

    /** @stackitem */
    export interface Block {
        readonly hash: ByteString,
        readonly version: number,
        readonly previousHash: ByteString,
        readonly merkleRoot: ByteString,
        readonly timestamp: bigint,
        readonly nonce: bigint,
        readonly index: number,
        readonly primaryIndex: number,
        readonly nextConsensus: ByteString,
        readonly transactionsCount: number
    }

    /** @stackitem */
    export interface Contract {
        readonly id: number;
        readonly updateCounter: number;
        readonly hash: ByteString;
        readonly nef: ByteString;
        readonly manifest: any;
    }
}

export { }