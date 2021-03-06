import * as chai from 'chai';
import * as _ from 'lodash';
import { Chance } from 'chance';
import { Collection, MongoClient } from 'mongodb';

var chance = new Chance();
// TODO client/server restricted api
// call meteor methods not verified by ts, not reponse result id and not make subs and abstract logic
// Nodes.nesting.put => _id
// Nodes.nesting.pull
// Nodes.nesting.move
// Nodes.nesting.deny({ put, pull, move })

// TODO if pull root positionId, currectly pulled children positions?

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

export type TPositions = IPosition[];

export interface IPutOptions {
  tree: string;
  docId: string;
  parentId: string|null;
  space?: string;
}

export interface IPullOptions {
  docId: string;
  parentId: string;
  tree: string;
}

export interface IUnnestOptions {
  positionId: string;
  tree: string;
  space: string;
}

export interface INameOptions {
  positionId?: string;

  parentId?: string;
  tree?: string;

  docId?: string;
  name: string;
}

/**
 * @example
 * const ns = new NestedSets();
 * ns.init({
 *   collection: Meteor["yourCollection"].rawCollection(),
 *   field: "yourField",
 *   client: Meteor["yourCollection"]._driver.mongo.client,
 * });
 */
export class NestedSets<Doc extends IDoc> {
  public c;
  public field: string;
  public client;

  init({
    collection,
    client,
    field = 'positions',
  }: {
    collection: Collection<any>;
    field?: string,
    client: MongoClient<any>;
  }) {
    this.c = collection;
    this.field = field;
    this.client = client;
  }

  generateId() {
    return chance.guid();
  }

  SimpleSchemaRules() {
    return {
      [`${this.field}`]: {
        type: Array,
        optional: true
      },
      [`${this.field}.$`]: Object,
      [`${this.field}.$._id`]: String,
      [`${this.field}.$.parentId`]: {
        type: String,
        optional: true,
      },
      [`${this.field}.$.tree`]: String,
      [`${this.field}.$.space`]: String,
      [`${this.field}.$.left`]: String,
      [`${this.field}.$.right`]: String,
      [`${this.field}.$.depth`]: String,
      [`${this.field}.$.name`]: {
        type: String,
        optional: true,
      },
    };
  }

  getAnyPositionsByTree(doc: Doc, tree: string) {
    if (doc && doc[this.field]) {
      const pss = [];
      for (let d = 0; d < doc[this.field].length; d++) {
        const ps = doc[this.field][d];
        if (ps.tree === tree) pss.push(ps);
      }
      return pss;
    }
    return [];
  }

  getPositionsByTreeIn(doc: Doc, tree: string, space: string, left: number, right: number) {
    const pss = [];
    if (doc && doc[this.field]) {
      for (let d = 0; d < doc[this.field].length; d++) {
        const ps = doc[this.field][d];
        if (ps.tree === tree && ps.space === space && ps.left >= left && ps.right <= right) pss.push(ps);
      }
    }
    return pss;
  }

  getPositionByPositionId(doc: Doc, id: string, tree: string, space: string) {
    if (doc && doc[this.field]) {
      for (let d = 0; d < doc[this.field].length; d++) {
        const ps = doc[this.field][d];
        if (String(ps._id) === String(id) && ps.tree === tree && ps.space === space) return ps;
      }
    }
  }

  getPositionsByParentId(doc: Doc, parentId: string, tree: string) {
    const pss = [];
    if (doc && doc[this.field]) {
      for (let d = 0; d < doc[this.field].length; d++) {
        const ps = doc[this.field][d];
        if (String(ps.parentId) === String(parentId) && ps.tree === tree) pss.push(ps);
      }
    }
    return pss;
  }

  getSizeFromPositions(positions: IPosition[]): number {
    if (positions && positions.length) {
      return positions[0].right - positions[0].left;
    }
    return 1;
  }
  
  async _move(session, tree, space, from, size) {
    const { field, c } = this;
    await c.updateMany(
      {
        [field]: {
          $elemMatch: {
            tree,
            space,
            left: { $gte: from },
          },
        },
      },
      {
        $inc: {
          [`${field}.$[pos].left`]: size,
          [`${field}.$[pos].right`]: size,
        },
      },
      {
        session,
        multi: true,
        arrayFilters: [{
          'pos.tree': tree,
          'pos.space': space,
          'pos.left': { $gte: from },
        }],
      }
    );
  }
  
  async _resize(session, tree, space, left, right, size) {
    const { field, c } = this;
    await c.updateMany(
      {
        [field]: {
          $elemMatch: {
            tree,
            space,
            left: { $lte: left },
            right: { $gte: right },
          },
        },
      },
      {
        $inc: {
          [`${field}.$[pos].right`]: size,
        },
      },
      {
        session,
        multi: true,
        arrayFilters: [{
          'pos.tree': tree,
          'pos.space': space,
          'pos.left': { $lte: left },
          'pos.right': { $gte: right },
        }],
      }
    );
  }

  async _unlast(session, tree, space) {
    const { field, c } = this;
    await c.updateMany(
      {
        [field]: {
          $elemMatch: {
            tree,
            space,
            last: true,
          },
        },
      },
      {
        $unset: {
          [`${field}.$[pos].last`]: true,
        },
      },
      {
        multi: true,
        arrayFilters: [{
          'pos.tree': tree,
          'pos.space': space,
          'pos.last': true,
        }],
        session,
      }
    );
  }

  async _last(session, tree, space, dPr) {
    const { field, c } = this;
    await c.updateMany(
      {
        [field]: {
          $elemMatch: {
            tree,
            space,
            right: dPr,
          },
        },
      },
      {
        $set: {
          [`${field}.$[pos].last`]: true,
        },
      },
      {
        arrayFilters: [{
          'pos.tree': tree,
          'pos.space': space,
          'pos.right': dPr,
        }],
        session,
      }
    );
  }

  async getLastInSpace(tree, space) {
    const { c, field } = this;

    const d = await c.findOne({
      [field]: {
        $elemMatch: {
          tree, space,
          last: true
        },
      }
    });
    if (d) {
      const dps = d[field];
      for (let p = 0; p < dps.length; p++) {
        const dp = dps[p];
        if (dp.tree === tree && dp.space === space && dp.last) return { d, dp };
      }
    }
    return;
  }

  async regetPos(docId, posId) {
    const { c, field } = this;

    const doc = await c.findOne({_id: docId});
    const dPs = doc[field];
    for (let dPi = 0; dPi < dPs.length; dPi++) {
      if (String(dPs[dPi]._id) === String(posId)) return dPs[dPi];
    }
  }

  async getChs(tree, dP) {
    const { c, field } = this;
    return await c.find({
      [field]: {
        $elemMatch: {
          tree: tree,
          space: dP.space,
          left: { $gt: dP.left },
          right: { $lt: dP.right },
        },
      },
    }).toArray();
  }

  async _push(session, chId, chP) {
    const { field, c } = this;

    await c.updateOne(
      { _id: chId },
      {
        $push: {
          [field]: chP,
        },
      },
      { session },
    );
  }

  async _pull(session, tree, space, gteLeft, lteRight, gteDepth) {
    const { c, field } = this;

    await c.updateMany(
      {
        [field]: {
          $elemMatch: {
            tree, space,
            left: { $gte: gteLeft },
            right: { $lte: lteRight },
            depth: { $gte: gteDepth },
          },
        }
      },
      {
        $pull: {
          [field]: {
            tree, space,
            left: { $gte: gteLeft },
            right: { $lte: lteRight },
            depth: { $gte: gteDepth },
          },
        },
      },
      { multi: true, session },
    );
  }

  isIncludes(tree, pPs, dPs) {
    for (let di = 0; di < dPs.length; di++) {
      for (let pi = 0; pi < pPs.length; pi++) {
        const dP = dPs[di];
        const pP = pPs[pi];
        if (dP.tree === pP.tree && dP.space === pP.space && dP.left >= pP.left && dP.right <= pP.right && dP.depth <= pP.depth) {
          return true;
        }
      } 
    }
    return false;
  }

  async put(options: IPutOptions) {
    const session = this.client.startSession();
    try {
      // ====================
      // INPUT VARS
      chai.assert.isObject(options);
      const { c, field } = this;
      const {
        tree, docId, parentId,
        space: maybeSpace,
      } = options;
      chai.assert.isString(docId, 'Option docId must be a string.');

      // ====================
      // LOCAL VARS

      // ====================
      // d - document
      const d = await c.findOne({_id: docId});
      chai.assert.exists(d, `Doc by docId ${docId} option not founded.`);
      
      const dPs = this.getAnyPositionsByTree(d, tree); // positions
      const dS = this.getSizeFromPositions(dPs); // size
      const dHasPosition = !!dPs.length;
      const dHasChildren = dS > 1;

      // ====================
      // p - parent
      let p, pPs;
      if (!_.isNull(parentId)) {
        chai.assert.isString(parentId, 'Option parentId must be a string or null.');
        p = await c.findOne({_id: parentId});
        chai.assert.exists(p, 'Parent not found');
        pPs = this.getAnyPositionsByTree(p, tree);
        chai.assert.isNotEmpty(pPs, 'Cant put into doc which not in tree.');
        chai.assert.isNotOk(maybeSpace, 'Cant put into doc and in custom space at same time.');
      }
      const _pPs = pPs && pPs.length;
      for (let pPi = 0; ((_pPs && pPi < pPs.length) || (!_pPs && !pPi)); pPi++) {
        const pP = pPs && pPs.length ? await this.regetPos(p._id, pPs[pPi]._id) : undefined;

        await session.startTransaction();

        // ====================
        // RESULT D POS
        const space = pP ? pP.space : maybeSpace || this.generateId();
  
        const lastDoc = await this.getLastInSpace(tree, space); 
        const newCoord = lastDoc ? lastDoc.dp.right + 1 : 0;
  
        const left = pP ? pP.right : newCoord;
        const right = pP ? pP.right + dS : newCoord + dS;
        const depth = pP ? pP.depth + 1 : 0;
        const last = !parentId;

        if (dHasPosition) {
          if (dHasChildren) {
            // +dPs+chPs
            // for (let dPi = 0; dPi < dPs.length; dPi++) {
            const dP = dPs[0];
            await this._move(session, tree, space, left, +dS+1);
            if (parentId) await this._resize(session, tree, space, pP.left, pP.right, +dS+1);
            const chs = await this.getChs(tree, dP);
            for (let c = 0; c < chs.length; c++) {
              const ch = chs[c];
              const chPs = this.getPositionsByTreeIn(ch, tree, dP.space, dP.left, dP.right);
              chai.assert.isNotEmpty(chPs, `Unexpected child positions not founded by ${JSON.stringify({ ch, tree, space: dP.space, left: dP.left, right: dP.right })}`);

              for (let chPi = 0; chPi < chPs.length; chPi++) {
                const chP = chPs[chPi];
                const chL = chP.left - dP.left;
                const chS = chP.right - chP.left;
                const chD = chP.depth - dP.depth;

                await this._push(session, ch._id, {
                  _id: this.generateId(),
                  parentId: chP.parentId,
                  tree, space,
                  left: chL + left,
                  right: chL + left + chS,
                  depth: chD + depth,
                });
              }
            }
            if (!parentId) await this._unlast(session, tree, space);

            await this._push(session, d._id, {
              _id: this.generateId(),
              parentId, tree, space, left, right, depth, last,
            });
            // }
          } else {
            // +dPs-chPs
            await this._move(session, tree, space, left, +dS+1);
            if (parentId) await this._resize(session, tree, space, pP.left, pP.right, +dS+1);
            if (!parentId) await this._unlast(session, tree, space);
            await this._push(session, docId, {
              _id: this.generateId(),
              parentId, tree, space, left, right, depth, last,
            });
          }
        } else {
          // -dPs-chPs
          await this._move(session, tree, space, left, +dS+1);
          if (parentId) await this._resize(session, tree, space, pP.left, pP.right, +dS+1);
          if (!parentId) await this._unlast(session, tree, space);
          await this._push(session, docId, {
            _id: this.generateId(),
            parentId, tree, space, left, right, depth, last,
          });
        }
        await session.commitTransaction();
      }
      await session.endSession();
    } catch(error) {
      if (session.transaction.state != 'NO_TRANSACTION') await session.abortTransaction();
      await session.endSession();
      throw error;
    }
  }

  async pull(options: IPullOptions) {
    const session = this.client.startSession();

    try {
      const {
        c, field,
      } = this;

      chai.assert.isObject(options);

      const { docId, parentId, tree } = options;

      let d, dPs;
      if (docId && parentId && tree) {
        chai.assert.isString(tree);
        d = await c.findOne({_id: docId});
        chai.assert.exists(d, `Doc is not founded.`);
        dPs = this.getPositionsByParentId(d, parentId, tree);
        chai.assert.isNotEmpty(dPs, `Positions in parentId ${parentId} of doc not founded`);
      } else {
        throw new Error(`Must be (positionId) or (docId and parentId and tree), not both.`);
      }

      for (let dPi = 0; dPi < dPs.length; dPi++) {
        await session.startTransaction();
        
        const dP = await this.regetPos(d._id, dPs[dPi]._id);
        if (dP.last) await this._last(session, dP.tree, dP.space, dP.left - 1);
        await this._pull(session, dP.tree, dP.space, dP.left, dP.right, dP.depth);
        if (dP.parentId) await this._resize(session, dP.tree, dP.space, dP.left, dP.right, -((dP.right - dP.left) + 1));
        await this._move(session, dP.tree, dP.space, dP.left, -((dP.right - dP.left) + 1));
        
        await session.commitTransaction();
      }
      await session.endSession();
    } catch(error) {
      if (session.transaction.state != 'NO_TRANSACTION') await session.abortTransaction();
      await session.endSession();
      throw error;
    }
  }

  async unnest(options: IUnnestOptions) {
    const session = this.client.startSession();

    try {
      const {
        c, field,
      } = this;

      chai.assert.isObject(options);

      const { positionId, tree, space } = options;
      chai.assert.exists(positionId, `positionId must be exists`);

      let d, dPs;
      d = await c.findOne({
        [field]: { $elemMatch: { _id: positionId, tree, space } },
      });
      chai.assert.exists(d, `Doc is not founded.`);
      const tdP = this.getPositionByPositionId(d, positionId, tree, space); 
      chai.assert.exists(tdP, `Doc position is not founded.`);
      dPs = [tdP];

      for (let dPi = 0; dPi < dPs.length; dPi++) {
        await session.startTransaction();
        
        const dP = await this.regetPos(d._id, dPs[dPi]._id);
        if (dP.last) await this._last(session, dP.tree, dP.space, dP.left - 1);
        await this._pull(session, dP.tree, dP.space, dP.left, dP.right, dP.depth);
        if (dP.parentId) await this._resize(session, dP.tree, dP.space, dP.left, dP.right, -((dP.right - dP.left) + 1));
        await this._move(session, dP.tree, dP.space, dP.left, -((dP.right - dP.left) + 1));
        
        await session.commitTransaction();
      }
      await session.endSession();
    } catch(error) {
      if (session.transaction.state != 'NO_TRANSACTION') await session.abortTransaction();
      await session.endSession();
      throw error;
    }
  }

  async name(options: INameOptions) {
    const { c, field, } = this;
    const { positionId, parentId, tree, docId, name } = options;

    const doc = await c.findOne({_id: docId});
    if (!doc) throw new Error(`Doc ${docId} not founded`);

    let $set: any = {};
    if (parentId && tree) {
      chai.assert.isString(parentId, 'Option parentId must be a string.');
      chai.assert.isString(tree, 'Option tree must be a string.');
      for (let p = 0; p < doc[field].length; p++) {
        if (String(doc[field][p].parentId) === String(parentId) && doc[field][p].tree === tree) {
          $set[`${field}.${p}.name`] = name;
        }
      }
    } else if (positionId) {
      for (let p = 0; p < doc[field].length; p++) {
        if (String(doc[field][p]._id) === String(positionId)) {
          if (doc[field][p].parentId) {
            for (let pa = 0; pa < doc[field].length; pa++) {
              if (String(doc[field][pa].parentId) === String(doc[field][p].parentId) && doc[field][pa].tree === doc[field][p].tree) {
                $set[`${field}.${pa}.name`] = name;
              }
            }
          } else {
            $set[`${field}.${p}.name`] = name;
          }
          break;
        }
      }
    } else throw new Error(`Options parentId (${parentId ? '+' : '-'}) and tree (${tree ? '+' : '-'}) or positionId (${positionId ? '+' : '-'}) must be defined.`);

    if (!_.isEmpty($set)) c.updateOne({_id:docId},{ $set },);
  }
}
