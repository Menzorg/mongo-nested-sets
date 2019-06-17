"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
require("mocha");
const chai_1 = require("chai");
const index_1 = require("../lib/index");
const mongodb_1 = require("mongodb");
let Nodes;
let mongo;
let db;
const toIds = (docs) => docs.map(d => d._id);
const assertPs = (ns, tree) => __awaiter(this, void 0, void 0, function* () {
    const docs = yield ns.c.find({}).toArray();
    for (let i = 0; i < docs.length; i++) {
        yield assertP(ns, tree, docs[i]._id);
    }
});
const assertP = (ns, tree, docId, toParent = true) => __awaiter(this, void 0, void 0, function* () {
    const doc = yield Nodes.findOne({ _id: docId });
    chai_1.assert.isOk(doc);
    const docPs = ns.getAnyPositionsByTree(doc, tree);
    const docS = ns.getSizeFromPositions(docPs);
    const chsByParentId = yield Nodes.find({
        [`${ns.positionField}.parentId`]: docId,
    }).toArray();
    let $or = docPs.map(({ tree, space, left, right, depth }) => ({
        tree,
        space,
        left: { $gt: left },
        right: { $lt: right },
        depth: depth + 1,
    }));
    let findObj = {
        [ns.positionField]: {
            $elemMatch: {
                tree,
            },
        },
    };
    if (!$or.length)
        $or = [{ _id: undefined }];
    findObj[ns.positionField].$elemMatch["$or"] = $or;
    const chsByCoords = yield Nodes.find(findObj).toArray();
    chai_1.assert.deepEqual(toIds(chsByParentId), toIds(chsByCoords));
    for (let dp = 0; dp < docPs.length; dp++) {
        const docP = docPs[dp];
        chai_1.assert.equal(docP.right - docP.left, docS);
        let chS = 0;
        for (let c = 0; c < chsByParentId.length; c++) {
            const ch = chsByParentId[c];
            let founded = false;
            for (let cp = 0; cp < ch.positions.length; cp++) {
                const chP = ch.positions[cp];
                if (chP.space.toString() === docP.space.toString() && chP.left > docP.left && chP.right < docP.right && chP.depth > docP.depth) {
                    chai_1.assert.isFalse(founded);
                    chS += (chP.right - chP.left) + 1;
                    founded = true;
                }
            }
            chai_1.assert.isTrue(founded);
        }
        chai_1.assert.equal(docS, chS + 1 || 1);
    }
    for (let c = 0; c < chsByParentId.length; c++) {
        const ch = chsByParentId[c];
        yield assertP(ns, tree, ch._id);
    }
});
describe('nested-sets', () => __awaiter(this, void 0, void 0, function* () {
    before((done) => {
        mongodb_1.MongoClient.connect(process.env.MONGO_URL, { useNewUrlParser: true }, function (err, client) {
            if (err)
                console.log(err);
            mongo = client;
            db = client.db('npm-tests');
            Nodes = db.collection('Nodes');
            Nodes.deleteMany({});
            ns.init({
                collection: Nodes,
                positionField: 'positions',
                client: mongo,
            });
            done();
        });
    });
    beforeEach(() => __awaiter(this, void 0, void 0, function* () {
        yield Nodes.deleteMany({});
    }));
    after(() => {
        mongo.close();
    });
    const ns = new index_1.NestedSets();
    const tree = 'nesting';
    const put = (tree, parentId, handler) => __awaiter(this, void 0, void 0, function* () {
        const docId = ns.generateId();
        yield Nodes.insertOne({ _id: docId });
        yield ns.put({ tree, docId, parentId, });
        if (handler)
            yield handler(docId);
        return docId;
    });
    describe('put', () => {
        it('-p-dPs-chPs-lPs-rPs', () => __awaiter(this, void 0, void 0, function* () {
            const docId = ns.generateId();
            yield Nodes.insertOne({ _id: docId });
            yield ns.put({ tree, docId, parentId: null, });
            const docs = yield Nodes.find({}).toArray();
            chai_1.assert.lengthOf(docs, 1);
            chai_1.assert.lengthOf(docs[0].positions, 1);
            yield assertPs(ns, tree);
        }));
        it('-p-dPs-chPs+lPs-rPs', () => __awaiter(this, void 0, void 0, function* () {
            const space = ns.generateId();
            const docIdL = ns.generateId();
            const docId = ns.generateId();
            yield Nodes.insertOne({ _id: docIdL });
            yield Nodes.insertOne({ _id: docId });
            yield ns.put({ tree, docId: docIdL, parentId: null, space,
            });
            yield ns.put({ tree, docId, parentId: null, space,
            });
            const docs = yield Nodes.find({}).toArray();
            chai_1.assert.lengthOf(docs, 2);
            chai_1.assert.lengthOf(docs[0].positions, 1);
            chai_1.assert.deepEqual(docs[0].positions[0], {
                _id: docs[0].positions[0]._id,
                parentId: null,
                tree,
                space,
                left: 0,
                right: 1,
                depth: 0,
            });
            chai_1.assert.deepEqual(docs[1].positions[0], {
                _id: docs[1].positions[0]._id,
                parentId: null,
                tree,
                space,
                left: 2,
                right: 3,
                depth: 0,
                last: true,
            });
            chai_1.assert.lengthOf(docs[1].positions, 1);
            yield assertPs(ns, tree);
        }));
        it('-p+dPs-chPs-lPs-rPs', () => __awaiter(this, void 0, void 0, function* () {
            const docId = ns.generateId();
            yield Nodes.insertOne({ _id: docId });
            yield ns.put({ tree, docId, parentId: null, });
            yield ns.put({ tree, docId, parentId: null, });
            const docs = yield Nodes.find({}).toArray();
            chai_1.assert.lengthOf(docs, 1);
            chai_1.assert.lengthOf(docs[0].positions, 2);
            chai_1.assert.deepEqual(docs[0].positions[0], {
                _id: docs[0].positions[0]._id,
                parentId: null,
                tree,
                space: docs[0].positions[0].space,
                left: 0,
                right: 1,
                depth: 0,
                last: true,
            });
            chai_1.assert.deepEqual(docs[0].positions[1], {
                _id: docs[0].positions[1]._id,
                parentId: null,
                tree,
                space: docs[0].positions[1].space,
                left: 0,
                right: 1,
                depth: 0,
                last: true,
            });
            yield assertPs(ns, tree);
        }));
        it('+p-dPs-chPs-lPs-rPs', () => __awaiter(this, void 0, void 0, function* () {
            const parentId = ns.generateId();
            const docId = ns.generateId();
            yield Nodes.insertOne({ _id: parentId });
            yield Nodes.insertOne({ _id: docId });
            yield ns.put({ tree, docId: parentId, parentId: null, });
            yield ns.put({ tree, docId, parentId, });
            const docs = yield Nodes.find({}).toArray();
            chai_1.assert.lengthOf(docs, 2);
            chai_1.assert.lengthOf(docs[0].positions, 1);
            chai_1.assert.lengthOf(docs[1].positions, 1);
            yield assertPs(ns, tree);
        }));
        it('-p+dPs+chPs-lPs-rPs', () => __awaiter(this, void 0, void 0, function* () {
            const parentId = ns.generateId();
            const docId = ns.generateId();
            yield Nodes.insertOne({ _id: parentId });
            yield Nodes.insertOne({ _id: docId });
            yield ns.put({ tree, docId: parentId, parentId: null, });
            yield ns.put({ tree, docId, parentId, });
            yield ns.put({ tree, docId: parentId, parentId: null, });
            const docs = yield Nodes.find({}).toArray();
            chai_1.assert.lengthOf(docs, 2);
            chai_1.assert.lengthOf(docs[0].positions, 2);
            chai_1.assert.lengthOf(docs[1].positions, 2);
            yield assertPs(ns, tree);
        }));
        it('+p+dPs-chPs-lPs-rPs', () => __awaiter(this, void 0, void 0, function* () {
            const rootId = ns.generateId();
            yield Nodes.insertOne({ _id: rootId });
            const parentId = ns.generateId();
            yield Nodes.insertOne({ _id: parentId });
            yield ns.put({ tree, docId: rootId, parentId: null, });
            yield ns.put({ tree, docId: parentId, parentId: null, });
            yield ns.put({ tree, docId: parentId, parentId: rootId, });
            const docs = yield Nodes.find({}).toArray();
            chai_1.assert.lengthOf(docs, 2);
            yield assertPs(ns, tree);
        }));
        it('+p+dPs+chPs-lPs-rPs', () => __awaiter(this, void 0, void 0, function* () {
            const rootId = ns.generateId();
            yield Nodes.insertOne({ _id: rootId });
            const parentId = ns.generateId();
            yield Nodes.insertOne({ _id: parentId });
            const docId = ns.generateId();
            yield Nodes.insertOne({ _id: docId });
            yield ns.put({ tree, docId: rootId, parentId: null, });
            yield ns.put({ tree, docId: parentId, parentId: null, });
            yield ns.put({ tree, docId, parentId, });
            yield ns.put({ tree, docId: parentId, parentId: rootId, });
            const docs = yield Nodes.find({}).toArray();
            chai_1.assert.lengthOf(docs, 3);
            yield assertPs(ns, tree);
        }));
        it('+p+dPs+chPs+lPs+rPs', () => __awaiter(this, void 0, void 0, function* () {
            let rootId, middleId;
            rootId = yield put(tree, null, (parentId) => __awaiter(this, void 0, void 0, function* () {
                yield put(tree, parentId, (parentId) => __awaiter(this, void 0, void 0, function* () {
                    yield put(tree, parentId, (parentId) => __awaiter(this, void 0, void 0, function* () { }));
                }));
                middleId = yield put(tree, parentId, (parentId) => __awaiter(this, void 0, void 0, function* () {
                }));
                yield put(tree, parentId, (parentId) => __awaiter(this, void 0, void 0, function* () {
                    yield put(tree, parentId, (parentId) => __awaiter(this, void 0, void 0, function* () { }));
                }));
            }));
            yield put(tree, middleId);
            const docs = yield Nodes.find({}).toArray();
            yield assertPs(ns, tree);
        }));
        it('+p2(1space)+dPs+chPs-lPs-rPs', () => __awaiter(this, void 0, void 0, function* () {
            const rootId = yield put(tree, null);
            const p0 = yield put(tree, rootId);
            const c0 = yield put(tree, p0);
            const c1 = yield put(tree, c0);
            const p1 = yield put(tree, rootId);
            yield ns.put({ tree, docId: c0, parentId: p1, });
            yield assertPs(ns, tree);
        }));
        it('+p2(1space)+dPs-chPs-lPs-rPs', () => __awaiter(this, void 0, void 0, function* () {
            const rootId = yield put(tree, null);
            const p0 = yield put(tree, rootId);
            const c0 = yield put(tree, p0);
            const p1 = yield put(tree, rootId);
            yield ns.put({ tree, docId: c0, parentId: p1, });
            const docs = yield Nodes.find({}).toArray();
            yield assertPs(ns, tree);
        }));
        it('+p2(2space)+dPs+chPs-lPs-rPs', () => __awaiter(this, void 0, void 0, function* () {
            const p0 = yield put(tree, null);
            const c0 = yield put(tree, p0);
            const c1 = yield put(tree, c0);
            const p1 = yield put(tree, null);
            yield ns.put({ tree, docId: c0, parentId: p1, });
            const docs = yield Nodes.find({}).toArray();
            yield assertPs(ns, tree);
        }));
        it('+p2(2space)+dPs-chPs-lPs-rPs', () => __awaiter(this, void 0, void 0, function* () {
            const p0 = yield put(tree, null);
            const c0 = yield put(tree, p0);
            const p1 = yield put(tree, null);
            yield ns.put({ tree, docId: c0, parentId: p1, });
            const docs = yield Nodes.find({}).toArray();
            yield assertPs(ns, tree);
        }));
    });
    describe('pull positionId', () => {
        it('-p-dPs-chPs-lPs-rPs', () => __awaiter(this, void 0, void 0, function* () {
            const nodeId = yield put(tree, null);
            const node = yield Nodes.findOne({ _id: nodeId });
            yield ns.pull({ positionId: node.positions[0]._id });
            const docs = yield Nodes.find({}).toArray();
            chai_1.assert.lengthOf(docs, 1);
            chai_1.assert.lengthOf(docs[0].positions, 0);
            yield assertPs(ns, tree);
        }));
        it('+p+dPs-chPs-lPs-rPs', () => __awaiter(this, void 0, void 0, function* () {
            const rootId = yield put(tree, null);
            const nodeId = yield put(tree, rootId);
            const node = yield Nodes.findOne({ _id: nodeId });
            yield ns.pull({ positionId: node.positions[0]._id });
            const docs = yield Nodes.find({}).toArray();
            chai_1.assert.lengthOf(docs, 2);
            chai_1.assert.lengthOf(docs[0].positions, 1);
            chai_1.assert.lengthOf(docs[1].positions, 0);
            yield assertPs(ns, tree);
        }));
        it('+p+dPs+chPs-lPs-rPs', () => __awaiter(this, void 0, void 0, function* () {
            const rootId = yield put(tree, null);
            const nodeId = yield put(tree, rootId);
            const childId = yield put(tree, nodeId);
            const node = yield Nodes.findOne({ _id: nodeId });
            yield ns.pull({ positionId: node.positions[0]._id });
            const docs = yield Nodes.find({}).toArray();
            chai_1.assert.lengthOf(docs, 3);
            chai_1.assert.lengthOf(docs[0].positions, 1);
            chai_1.assert.lengthOf(docs[1].positions, 0);
            chai_1.assert.lengthOf(docs[2].positions, 0);
            yield assertPs(ns, tree);
        }));
        it('+p+dPs-chPs+lPs+rPs', () => __awaiter(this, void 0, void 0, function* () {
            const rootId = yield put(tree, null);
            const leftId = yield put(tree, rootId);
            const centerId = yield put(tree, rootId);
            const rightId = yield put(tree, rootId);
            const nodeId = yield put(tree, centerId);
            const node = yield Nodes.findOne({ _id: nodeId });
            yield ns.pull({ positionId: node.positions[0]._id });
            const docs = yield Nodes.find({}).toArray();
            chai_1.assert.lengthOf(docs, 5);
            chai_1.assert.lengthOf(docs[0].positions, 1);
            chai_1.assert.lengthOf(docs[1].positions, 1);
            chai_1.assert.lengthOf(docs[2].positions, 1);
            chai_1.assert.lengthOf(docs[3].positions, 1);
            chai_1.assert.lengthOf(docs[4].positions, 0);
            yield assertPs(ns, tree);
        }));
        it('+p+dPs+chPs+lPs+rPs', () => __awaiter(this, void 0, void 0, function* () {
            const rootId = yield put(tree, null);
            const leftId = yield put(tree, rootId);
            const centerId = yield put(tree, rootId);
            const rightId = yield put(tree, rootId);
            const nodeId = yield put(tree, centerId);
            const childId = yield put(tree, nodeId);
            const node = yield Nodes.findOne({ _id: nodeId });
            yield ns.pull({ positionId: node.positions[0]._id });
            const docs = yield Nodes.find({}).toArray();
            chai_1.assert.lengthOf(docs, 6);
            chai_1.assert.lengthOf(docs[0].positions, 1);
            chai_1.assert.lengthOf(docs[1].positions, 1);
            chai_1.assert.lengthOf(docs[2].positions, 1);
            chai_1.assert.lengthOf(docs[3].positions, 1);
            chai_1.assert.lengthOf(docs[4].positions, 0);
            chai_1.assert.lengthOf(docs[5].positions, 0);
            yield assertPs(ns, tree);
        }));
    });
    describe('pull docId and parentId and tree', () => {
        it('+p+dPs-chPs-lPs-rPs', () => __awaiter(this, void 0, void 0, function* () {
            const rootId = yield put(tree, null);
            const nodeId = yield put(tree, rootId);
            yield ns.pull({ parentId: rootId, docId: nodeId, tree: 'nesting' });
            const docs = yield Nodes.find({}).toArray();
            chai_1.assert.lengthOf(docs, 2);
            chai_1.assert.lengthOf(docs[0].positions, 1);
            chai_1.assert.lengthOf(docs[1].positions, 0);
            yield assertPs(ns, tree);
        }));
        it('+p+dPs+chPs-lPs-rPs', () => __awaiter(this, void 0, void 0, function* () {
            const rootId = yield put(tree, null);
            const nodeId = yield put(tree, rootId);
            const childId = yield put(tree, nodeId);
            yield ns.pull({ parentId: rootId, docId: nodeId, tree: 'nesting' });
            const docs = yield Nodes.find({}).toArray();
            chai_1.assert.lengthOf(docs, 3);
            chai_1.assert.lengthOf(docs[0].positions, 1);
            chai_1.assert.lengthOf(docs[1].positions, 0);
            chai_1.assert.lengthOf(docs[2].positions, 0);
            yield assertPs(ns, tree);
        }));
        it('+p+dPs-chPs+lPs+rPs', () => __awaiter(this, void 0, void 0, function* () {
            const rootId = yield put(tree, null);
            const leftId = yield put(tree, rootId);
            const centerId = yield put(tree, rootId);
            const rightId = yield put(tree, rootId);
            const nodeId = yield put(tree, centerId);
            yield ns.pull({ parentId: centerId, docId: nodeId, tree: 'nesting' });
            const docs = yield Nodes.find({}).toArray();
            chai_1.assert.lengthOf(docs, 5);
            chai_1.assert.lengthOf(docs[0].positions, 1);
            chai_1.assert.lengthOf(docs[1].positions, 1);
            chai_1.assert.lengthOf(docs[2].positions, 1);
            chai_1.assert.lengthOf(docs[3].positions, 1);
            chai_1.assert.lengthOf(docs[4].positions, 0);
            yield assertPs(ns, tree);
        }));
        it('+p+dPs+chPs+lPs+rPs', () => __awaiter(this, void 0, void 0, function* () {
            const rootId = yield put(tree, null);
            const leftId = yield put(tree, rootId);
            const centerId = yield put(tree, rootId);
            const rightId = yield put(tree, rootId);
            const nodeId = yield put(tree, centerId);
            const childId = yield put(tree, nodeId);
            yield ns.pull({ parentId: centerId, docId: nodeId, tree: 'nesting' });
            const docs = yield Nodes.find({}).toArray();
            chai_1.assert.lengthOf(docs, 6);
            chai_1.assert.lengthOf(docs[0].positions, 1);
            chai_1.assert.lengthOf(docs[1].positions, 1);
            chai_1.assert.lengthOf(docs[2].positions, 1);
            chai_1.assert.lengthOf(docs[3].positions, 1);
            chai_1.assert.lengthOf(docs[4].positions, 0);
            chai_1.assert.lengthOf(docs[5].positions, 0);
            yield assertPs(ns, tree);
        }));
    });
}));
//# sourceMappingURL=index.js.map