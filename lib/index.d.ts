import { Collection, MongoClient } from 'mongodb';
export interface IDoc {
    _id: string;
    [key: string]: any;
}
export interface IPosition {
    _id: string;
    parentId?: string;
    tree: string;
    space: string;
    left: number;
    right: number;
    depth: number;
    last?: boolean;
    name?: string;
}
export declare type TPositions = IPosition[];
export interface IPutOptions {
    tree: string;
    docId: string;
    parentId: string | null;
    space?: string;
}
export interface IPullOptions {
    positionId?: string;
    docId?: string;
    parentId?: string;
    tree?: string;
}
export interface INameOptions {
    positionId?: string;
    parentId?: string;
    tree?: string;
    docId?: string;
    name: string;
}
export declare class NestedSets<Doc extends IDoc> {
    c: any;
    field: string;
    client: any;
    init({ collection, client, field, }: {
        collection: Collection<any>;
        field?: string;
        client: MongoClient<any>;
    }): void;
    SimpleSchemaRules(): {
        [x: string]: ObjectConstructor | StringConstructor | {
            type: ArrayConstructor;
            optional: boolean;
        } | {
            type: StringConstructor;
            optional: boolean;
        };
    };
    getAnyPositionsByTree(doc: Doc, tree: string): any[];
    getPositionsByTreeIn(doc: Doc, tree: string, space: string, left: number, right: number): any[];
    getPositionByPositionId(doc: Doc, id: string): any;
    getPositionsByParentId(doc: Doc, parentId: string, tree: string): any[];
    getSizeFromPositions(positions: IPosition[]): number;
    _move(session: any, tree: any, space: any, from: any, size: any): Promise<void>;
    _resize(session: any, tree: any, space: any, left: any, right: any, size: any): Promise<void>;
    _unlast(session: any, tree: any, space: any): Promise<void>;
    _last(session: any, tree: any, space: any, dPr: any): Promise<void>;
    getLastInSpace(tree: any, space: any): Promise<{
        d: any;
        dp: any;
    }>;
    regetPos(docId: any, posId: any): Promise<any>;
    getChs(tree: any, dP: any): Promise<any>;
    _push(session: any, chId: any, chP: any): Promise<void>;
    _pull(session: any, tree: any, space: any, gteLeft: any, lteRight: any, gteDepth: any): Promise<void>;
    isIncludes(tree: any, pPs: any, dPs: any): boolean;
    put(options: IPutOptions): Promise<void>;
    pull(options: IPullOptions): Promise<void>;
    name(options: INameOptions): Promise<void>;
}
