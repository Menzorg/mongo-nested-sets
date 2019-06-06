import 'mocha';
import { assert } from 'chai';

import { NestedSets } from '../lib/index';
import { ObjectID, MongoClient } from 'mongodb';

let Nodes;
let mongo;
let db;

const toIds = (docs) => docs.map(d => d._id);

const draw = (name: string, docs: any[]) => {
  docs.forEach(({
    _id,
    positions,
  }) => console.log(`${_id.slice(0, 4)} ${positions && positions.map(({
    space, parentId, left, right, depth
  }) => `[P:(${parentId && parentId.slice(0, 4)})S:(${space.slice(0, 4)})${left}|${right}{${depth}}(${right - left})]`).join(' ')}`));
}

const assertPs = async (ns, tree) => {
  const docs = await ns.c.find({}).toArray();
  for (let i = 0; i<docs.length; i++) {
    await assertP(ns, tree, docs[i]._id)
  }
};

const assertP = async (ns, tree, docId, toParent = true) => {
  const doc = await Nodes.findOne({_id: docId});
  assert.isOk(doc);

  const docPs = ns.getAnyPositionsByTree(doc, tree);
  const docS = ns.getSizeFromPositions(docPs);

  const chsByParentId = await Nodes.find({
    [`${ns.field}.parentId`]: docId,
  }).toArray();

  const chsByCoords = await Nodes.find({
    [ns.field]: {
      $elemMatch: {
        tree,
        $or: docPs.map(({
          tree, space, left, right, depth
        }) => ({
          tree,
          space,
          left: { $gt: left },
          right: { $lt: right },
          depth: depth + 1,
        })),
      },
    },
  }).toArray();

  // console.log('docS',docId);
  // console.log('docPs',docPs);
  // console.log('docS',docS);
  // console.log('chsByParentId',toIds(chsByParentId));
  // console.log('chsByCoords',toIds(chsByCoords));

  // children by parents and coords equal
  assert.deepEqual(toIds(chsByParentId), toIds(chsByCoords));

  // for each parent pos, must have one child pos
  for (let dp = 0; dp < docPs.length; dp++) {
    const docP = docPs[dp];
    assert.equal(docP.right - docP.left, docS);
    let chS = 0;
    for (let c = 0; c < chsByParentId.length; c++) {
      const ch = chsByParentId[c];
      let founded = false;
      for (let cp = 0; cp < ch.positions.length; cp++) {
        const chP = ch.positions[cp];
        if (chP.space.toString() === docP.space.toString() && chP.left > docP.left && chP.right < docP.right && chP.depth > docP.depth) {
          assert.isFalse(founded);
          chS += (chP.right - chP.left) + 1;
          founded = true;
        }
      }
      assert.isTrue(founded);
    }
    assert.equal(docS, chS + 1 || 1);
  }

  for (let c = 0; c < chsByParentId.length; c++) {
    const ch = chsByParentId[c];
    await assertP(ns, tree, ch._id);
  }
};

// p parent
// dPs document positions
// chPs children positions
// lPs left positions
// rPs right positions
describe('nested-sets', async () => {
  before((done) => {
    MongoClient.connect(process.env.MONGO_URL,{ useNewUrlParser: true }, function(err, client) {
      mongo = client;
      db = client.db('npm-tests')
      Nodes = db.collection('Nodes');
      Nodes.deleteMany({});
      ns.init({
        collection: Nodes,
        field: 'positions',
        client: mongo,
      });
      done();
    });
  });
  beforeEach(async () => {
    await Nodes.deleteMany({});
  });
  const ns = new NestedSets();
  const tree = 'nesting';
  const put = async (tree, parentId, handler?) => {
    const docId = new ObjectID().toString();
    await Nodes.insertOne({_id: docId});
    await ns.put({ tree, docId, parentId, });
    if (handler) await handler(docId);
    return docId;
  };
  describe('put', () => {
    it('-p-dPs-chPs-lPs-rPs', async () => {
      const docId = new ObjectID().toString();
      await Nodes.insertOne({_id: docId});
      await ns.put({ tree, docId, parentId: null, });
      const docs = await Nodes.find({}).toArray();
      assert.lengthOf(docs, 1);
      assert.lengthOf(docs[0].positions, 1);
      await assertPs(ns, tree);
    });
    it('-p-dPs-chPs+lPs-rPs', async () => {
      const space = new ObjectID().toString();
      const docIdL = new ObjectID().toString();
      const docId = new ObjectID().toString();
      await Nodes.insertOne({_id: docIdL});
      await Nodes.insertOne({_id: docId});
      await ns.put({ tree, docId: docIdL, parentId: null, space,
      });
      await ns.put({ tree, docId, parentId: null, space,
      });
      const docs = await Nodes.find({}).toArray();
      assert.lengthOf(docs, 2);
      assert.lengthOf(docs[0].positions, 1);
      assert.deepEqual(
        docs[0].positions[0],
        {
          _id: docs[0].positions[0]._id,
          parentId: null,
          tree,
          space,
          left: 0,
          right: 1,
          depth: 0,
        },
      );
      assert.deepEqual(
        docs[1].positions[0],
        {
          _id: docs[1].positions[0]._id,
          parentId: null,
          tree,
          space,
          left: 2,
          right: 3,
          depth: 0,
          last: true,
        },
      );
      assert.lengthOf(docs[1].positions, 1);
      await assertPs(ns, tree);
    });
    it('-p+dPs-chPs-lPs-rPs', async () => {
      const docId = new ObjectID().toString();
      await Nodes.insertOne({_id: docId});
      await ns.put({ tree, docId, parentId: null, });
      await ns.put({ tree, docId, parentId: null, });
      const docs = await Nodes.find({}).toArray();
      assert.lengthOf(docs, 1);
      assert.lengthOf(docs[0].positions, 2);
      assert.deepEqual(
        docs[0].positions[0],
        {
          _id: docs[0].positions[0]._id,
          parentId: null,
          tree,
          space: docs[0].positions[0].space,
          left: 0,
          right: 1,
          depth: 0,
          last: true,
        },
      );
      assert.deepEqual(
        docs[0].positions[1],
        {
          _id: docs[0].positions[1]._id,
          parentId: null,
          tree,
          space: docs[0].positions[1].space,
          left: 0,
          right: 1,
          depth: 0,
          last: true,
        },
      );
      await assertPs(ns, tree);
    });
    it('+p-dPs-chPs-lPs-rPs', async () => {
      const parentId = new ObjectID().toString();
      const docId = new ObjectID().toString();
      await Nodes.insertOne({_id: parentId});
      await Nodes.insertOne({_id: docId});
      await ns.put({ tree, docId: parentId, parentId: null, });
      await ns.put({ tree, docId, parentId, });
      const docs = await Nodes.find({}).toArray();
      assert.lengthOf(docs, 2);
      assert.lengthOf(docs[0].positions, 1);
      assert.lengthOf(docs[1].positions, 1);
      await assertPs(ns, tree);
    });
    it('-p+dPs+chPs-lPs-rPs', async () => {
      const parentId = new ObjectID().toString();
      const docId = new ObjectID().toString();
      await Nodes.insertOne({_id: parentId});
      await Nodes.insertOne({_id: docId});
      await ns.put({ tree, docId: parentId, parentId: null, });
      await ns.put({ tree, docId, parentId, });
      await ns.put({ tree, docId: parentId, parentId: null, });
      const docs = await Nodes.find({}).toArray();
      assert.lengthOf(docs, 2);
      assert.lengthOf(docs[0].positions, 2);
      assert.lengthOf(docs[1].positions, 2);
      await assertPs(ns, tree);
    });
    it('+p+dPs-chPs-lPs-rPs', async () => {
      const rootId = new ObjectID().toString();
      await Nodes.insertOne({_id: rootId});
      const parentId = new ObjectID().toString();
      await Nodes.insertOne({_id: parentId});
      await ns.put({ tree, docId: rootId, parentId: null, });
      await ns.put({ tree, docId: parentId, parentId: null, });
      await ns.put({ tree, docId: parentId, parentId: rootId, });
      const docs = await Nodes.find({}).toArray();
      assert.lengthOf(docs, 2);
      await assertPs(ns, tree);
    });
    it('+p+dPs+chPs-lPs-rPs', async () => {
      const rootId = new ObjectID().toString();
      await Nodes.insertOne({_id: rootId});
      const parentId = new ObjectID().toString();
      await Nodes.insertOne({_id: parentId});
      const docId = new ObjectID().toString();
      await Nodes.insertOne({_id: docId});
      await ns.put({ tree, docId: rootId, parentId: null, });
      await ns.put({ tree, docId: parentId, parentId: null, });
      await ns.put({ tree, docId, parentId, });
      await ns.put({ tree, docId: parentId, parentId: rootId, });
      const docs = await Nodes.find({}).toArray();
      assert.lengthOf(docs, 3);
      await assertPs(ns, tree);
    });
    it('+p+dPs+chPs+lPs+rPs', async () => {
      let rootId, middleId;
      rootId = await put(tree, null, async (parentId) => {
        await put(tree, parentId, async (parentId) => {
          await put(tree, parentId, async (parentId) => {});
        });
        middleId = await put(tree, parentId, async (parentId) => {
        });
        await put(tree, parentId, async (parentId) => {
          await put(tree, parentId, async (parentId) => {});
        });
      });
      await put(tree, middleId);
      const docs = await Nodes.find({}).toArray();
      await assertPs(ns, tree);
    });
    it('+p2(1space)+dPs+chPs-lPs-rPs', async () => {
      const rootId = await put(tree, null);
      const p0 = await put(tree, rootId);
      const c0 = await put(tree, p0);
      const c1 = await put(tree, c0);
      const p1 = await put(tree, rootId);
      await ns.put({ tree, docId: c0, parentId: p1, });
      const docs = await Nodes.find({}).toArray();
      await assertPs(ns, tree);
    });
    it('+p2(1space)+dPs-chPs-lPs-rPs', async () => {
      const rootId = await put(tree, null);
      const p0 = await put(tree, rootId);
      const c0 = await put(tree, p0);
      const p1 = await put(tree, rootId);
      await ns.put({ tree, docId: c0, parentId: p1, });
      const docs = await Nodes.find({}).toArray();
      await assertPs(ns, tree);
    });
    it('+p2(2space)+dPs+chPs-lPs-rPs', async () => {
      const p0 = await put(tree, null);
      const c0 = await put(tree, p0);
      const c1 = await put(tree, c0);
      const p1 = await put(tree, null);
      await ns.put({ tree, docId: c0, parentId: p1, });
      const docs = await Nodes.find({}).toArray();
      await assertPs(ns, tree);
      await assertPs(ns, tree);
    });
    it('+p2(2space)+dPs-chPs-lPs-rPs', async () => {
      const p0 = await put(tree, null);
      const c0 = await put(tree, p0);
      const p1 = await put(tree, null);
      await ns.put({ tree, docId: c0, parentId: p1, });
      const docs = await Nodes.find({}).toArray();
      await assertPs(ns, tree);
      await assertPs(ns, tree);
    });
  });
  describe('pull positionId', () => {
    it('-p-dPs-chPs-lPs-rPs', async () => {
      const nodeId = await put(tree, null);
      const node = await Nodes.findOne({_id: nodeId});
      await ns.pull({ positionId: node.positions[0]._id });
      const docs = await Nodes.find({}).toArray();
      assert.lengthOf(docs, 1);
      assert.lengthOf(docs[0].positions, 0);
      await assertPs(ns, tree);
    });
    it('+p+dPs-chPs-lPs-rPs', async () => {
      const rootId = await put(tree, null);
      const nodeId = await put(tree, rootId);
      const node = await Nodes.findOne({_id: nodeId});
      await ns.pull({ positionId: node.positions[0]._id });
      const docs = await Nodes.find({}).toArray();
      assert.lengthOf(docs, 2);
      assert.lengthOf(docs[0].positions, 1);
      assert.lengthOf(docs[1].positions, 0);
      await assertPs(ns, tree);
    });
    it('+p+dPs+chPs-lPs-rPs', async () => {
      const rootId = await put(tree, null);
      const nodeId = await put(tree, rootId);
      const childId = await put(tree, nodeId);
      const node = await Nodes.findOne({_id: nodeId});
      await ns.pull({ positionId: node.positions[0]._id });
      const docs = await Nodes.find({}).toArray();
      assert.lengthOf(docs, 3);
      assert.lengthOf(docs[0].positions, 1);
      assert.lengthOf(docs[1].positions, 0);
      assert.lengthOf(docs[2].positions, 0);
      await assertPs(ns, tree);
    });
    it('+p+dPs-chPs+lPs+rPs', async () => {
      const rootId = await put(tree, null);
      const leftId = await put(tree, rootId);
      const centerId = await put(tree, rootId);
      const rightId = await put(tree, rootId);
      const nodeId = await put(tree, centerId);
      const node = await Nodes.findOne({_id: nodeId});
      await ns.pull({ positionId: node.positions[0]._id });
      const docs = await Nodes.find({}).toArray();
      assert.lengthOf(docs, 5);
      assert.lengthOf(docs[0].positions, 1);
      assert.lengthOf(docs[1].positions, 1);
      assert.lengthOf(docs[2].positions, 1);
      assert.lengthOf(docs[3].positions, 1);
      assert.lengthOf(docs[4].positions, 0);
      await assertPs(ns, tree);
    });
    it('+p+dPs+chPs+lPs+rPs', async () => {
      const rootId = await put(tree, null);
      const leftId = await put(tree, rootId);
      const centerId = await put(tree, rootId);
      const rightId = await put(tree, rootId);
      const nodeId = await put(tree, centerId);
      const childId = await put(tree, nodeId);
      const node = await Nodes.findOne({_id: nodeId});
      await ns.pull({ positionId: node.positions[0]._id });
      const docs = await Nodes.find({}).toArray();
      assert.lengthOf(docs, 6);
      assert.lengthOf(docs[0].positions, 1);
      assert.lengthOf(docs[1].positions, 1);
      assert.lengthOf(docs[2].positions, 1);
      assert.lengthOf(docs[3].positions, 1);
      assert.lengthOf(docs[4].positions, 0);
      assert.lengthOf(docs[5].positions, 0);
      await assertPs(ns, tree);
    });
  });
  describe('pull docId and parentId', () => {
    it('+p+dPs-chPs-lPs-rPs', async () => {
      const rootId = await put(tree, null);
      const nodeId = await put(tree, rootId);
      await ns.pull({ parentId: rootId, docId: nodeId });
      const docs = await Nodes.find({}).toArray();
      assert.lengthOf(docs, 2);
      assert.lengthOf(docs[0].positions, 1);
      assert.lengthOf(docs[1].positions, 0);
      await assertPs(ns, tree);
    });
    it('+p+dPs+chPs-lPs-rPs', async () => {
      const rootId = await put(tree, null);
      const nodeId = await put(tree, rootId);
      const childId = await put(tree, nodeId);
      await ns.pull({ parentId: rootId, docId: nodeId });
      const docs = await Nodes.find({}).toArray();
      assert.lengthOf(docs, 3);
      assert.lengthOf(docs[0].positions, 1);
      assert.lengthOf(docs[1].positions, 0);
      assert.lengthOf(docs[2].positions, 0);
      await assertPs(ns, tree);
    });
    it('+p+dPs-chPs+lPs+rPs', async () => {
      const rootId = await put(tree, null);
      const leftId = await put(tree, rootId);
      const centerId = await put(tree, rootId);
      const rightId = await put(tree, rootId);
      const nodeId = await put(tree, centerId);
      await ns.pull({ parentId: centerId, docId: nodeId });
      const docs = await Nodes.find({}).toArray();
      assert.lengthOf(docs, 5);
      assert.lengthOf(docs[0].positions, 1);
      assert.lengthOf(docs[1].positions, 1);
      assert.lengthOf(docs[2].positions, 1);
      assert.lengthOf(docs[3].positions, 1);
      assert.lengthOf(docs[4].positions, 0);
      await assertPs(ns, tree);
    });
    it('+p+dPs+chPs+lPs+rPs', async () => {
      const rootId = await put(tree, null);
      const leftId = await put(tree, rootId);
      const centerId = await put(tree, rootId);
      const rightId = await put(tree, rootId);
      const nodeId = await put(tree, centerId);
      const childId = await put(tree, nodeId);
      await ns.pull({ parentId: centerId, docId: nodeId });
      const docs = await Nodes.find({}).toArray();
      assert.lengthOf(docs, 6);
      assert.lengthOf(docs[0].positions, 1);
      assert.lengthOf(docs[1].positions, 1);
      assert.lengthOf(docs[2].positions, 1);
      assert.lengthOf(docs[3].positions, 1);
      assert.lengthOf(docs[4].positions, 0);
      assert.lengthOf(docs[5].positions, 0);
      await assertPs(ns, tree);
    });
  });
});