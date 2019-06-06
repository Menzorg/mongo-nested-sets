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
const chai = require("chai");
const _ = require("lodash");
const mongodb_1 = require("mongodb");
class NestedSets {
    init({ collection, client, field = 'positions', }) {
        this.c = collection;
        this.field = field;
        this.client = client;
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
    getAnyPositionsByTree(doc, tree) {
        if (doc && doc[this.field]) {
            const pss = [];
            for (let d = 0; d < doc[this.field].length; d++) {
                const ps = doc[this.field][d];
                if (ps.tree === tree)
                    pss.push(ps);
            }
            return pss;
        }
        return [];
    }
    getPositionsByTreeIn(doc, tree, space, left, right) {
        const pss = [];
        if (doc && doc[this.field]) {
            for (let d = 0; d < doc[this.field].length; d++) {
                const ps = doc[this.field][d];
                if (ps.tree === tree && ps.space === space && ps.left >= left && ps.right <= right)
                    pss.push(ps);
            }
        }
        return pss;
    }
    getPositionByPositionId(doc, id) {
        if (doc && doc[this.field]) {
            for (let d = 0; d < doc[this.field].length; d++) {
                const ps = doc[this.field][d];
                if (String(ps._id) === String(id))
                    return ps;
            }
        }
    }
    getPositionsByParentId(doc, parentId, tree) {
        const pss = [];
        if (doc && doc[this.field]) {
            for (let d = 0; d < doc[this.field].length; d++) {
                const ps = doc[this.field][d];
                if (String(ps.parentId) === String(parentId) && ps.tree === tree)
                    pss.push(ps);
            }
        }
        return pss;
    }
    getSizeFromPositions(positions) {
        if (positions && positions.length) {
            return positions[0].right - positions[0].left;
        }
        return 1;
    }
    _move(session, tree, space, from, size) {
        return __awaiter(this, void 0, void 0, function* () {
            const { field, c } = this;
            yield c.updateMany({
                [field]: {
                    $elemMatch: {
                        tree,
                        space,
                        left: { $gte: from },
                    },
                },
            }, {
                $inc: {
                    [`${field}.$[pos].left`]: size,
                    [`${field}.$[pos].right`]: size,
                },
            }, {
                session,
                multi: true,
                arrayFilters: [{
                        'pos.tree': tree,
                        'pos.space': space,
                        'pos.left': { $gte: from },
                    }],
            });
        });
    }
    _resize(session, tree, space, left, right, size) {
        return __awaiter(this, void 0, void 0, function* () {
            const { field, c } = this;
            yield c.updateMany({
                [field]: {
                    $elemMatch: {
                        tree,
                        space,
                        left: { $lte: left },
                        right: { $gte: right },
                    },
                },
            }, {
                $inc: {
                    [`${field}.$[pos].right`]: size,
                },
            }, {
                session,
                multi: true,
                arrayFilters: [{
                        'pos.tree': tree,
                        'pos.space': space,
                        'pos.left': { $lte: left },
                        'pos.right': { $gte: right },
                    }],
            });
        });
    }
    _unlast(session, tree, space) {
        return __awaiter(this, void 0, void 0, function* () {
            const { field, c } = this;
            yield c.updateMany({
                [field]: {
                    $elemMatch: {
                        tree,
                        space,
                        last: true,
                    },
                },
            }, {
                $unset: {
                    [`${field}.$[pos].last`]: true,
                },
            }, {
                multi: true,
                arrayFilters: [{
                        'pos.tree': tree,
                        'pos.space': space,
                        'pos.last': true,
                    }],
                session,
            });
        });
    }
    _last(session, tree, space, dPr) {
        return __awaiter(this, void 0, void 0, function* () {
            const { field, c } = this;
            yield c.updateMany({
                [field]: {
                    $elemMatch: {
                        tree,
                        space,
                        right: dPr,
                    },
                },
            }, {
                $set: {
                    [`${field}.$[pos].last`]: true,
                },
            }, {
                arrayFilters: [{
                        'pos.tree': tree,
                        'pos.space': space,
                        'pos.right': dPr,
                    }],
                session,
            });
        });
    }
    getLastInSpace(tree, space) {
        return __awaiter(this, void 0, void 0, function* () {
            const { c, field } = this;
            const d = yield c.findOne({
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
                    if (dp.tree === tree && dp.space === space && dp.last)
                        return { d, dp };
                }
            }
            return;
        });
    }
    regetPos(docId, posId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { c, field } = this;
            const doc = yield c.findOne({ _id: docId });
            const dPs = doc[field];
            for (let dPi = 0; dPi < dPs.length; dPi++) {
                if (String(dPs[dPi]._id) === String(posId))
                    return dPs[dPi];
            }
        });
    }
    getChs(tree, dP) {
        return __awaiter(this, void 0, void 0, function* () {
            const { c, field } = this;
            return yield c.find({
                [field]: {
                    $elemMatch: {
                        tree: tree,
                        space: dP.space,
                        left: { $gt: dP.left },
                        right: { $lt: dP.right },
                    },
                },
            }).toArray();
        });
    }
    _push(session, chId, chP) {
        return __awaiter(this, void 0, void 0, function* () {
            const { field, c } = this;
            yield c.updateOne({ _id: chId }, {
                $push: {
                    [field]: chP,
                },
            }, { session });
        });
    }
    _pull(session, tree, space, gteLeft, lteRight, gteDepth) {
        return __awaiter(this, void 0, void 0, function* () {
            const { c, field } = this;
            yield c.updateMany({
                [field]: {
                    $elemMatch: {
                        tree, space,
                        left: { $gte: gteLeft },
                        right: { $lte: lteRight },
                        depth: { $gte: gteDepth },
                    },
                }
            }, {
                $pull: {
                    [field]: {
                        tree, space,
                        left: { $gte: gteLeft },
                        right: { $lte: lteRight },
                        depth: { $gte: gteDepth },
                    },
                },
            }, { multi: true, session });
        });
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
    put(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const session = this.client.startSession();
            try {
                chai.assert.isObject(options);
                const { c, field } = this;
                const { tree, docId, parentId, space: maybeSpace, } = options;
                chai.assert.isString(docId, 'Option docId must be a string.');
                const d = yield c.findOne({ _id: docId });
                chai.assert.exists(d, `Doc by docId ${docId} option not founded.`);
                const dPs = this.getAnyPositionsByTree(d, tree);
                const dS = this.getSizeFromPositions(dPs);
                const dHasPosition = !!dPs.length;
                const dHasChildren = dS > 1;
                let p, pPs;
                if (!_.isNull(parentId)) {
                    chai.assert.isString(parentId, 'Option parentId must be a string or null.');
                    p = yield c.findOne({ _id: parentId });
                    chai.assert.exists(p, 'Parent not found');
                    pPs = this.getAnyPositionsByTree(p, tree);
                    chai.assert.isNotEmpty(pPs, 'Cant put into doc which not in tree.');
                    chai.assert.isNotOk(maybeSpace, 'Cant put into doc and in custom space at same time.');
                }
                const _pPs = pPs && pPs.length;
                for (let pPi = 0; ((_pPs && pPi < pPs.length) || (!_pPs && !pPi)); pPi++) {
                    const pP = pPs && pPs.length ? yield this.regetPos(p._id, pPs[pPi]._id) : undefined;
                    yield session.startTransaction();
                    const space = pP ? pP.space : maybeSpace || new mongodb_1.ObjectID().toString();
                    const lastDoc = yield this.getLastInSpace(tree, space);
                    const newCoord = lastDoc ? lastDoc.dp.right + 1 : 0;
                    const left = pP ? pP.right : newCoord;
                    const right = pP ? pP.right + dS : newCoord + dS;
                    const depth = pP ? pP.depth + 1 : 0;
                    const last = !parentId;
                    if (dHasPosition) {
                        if (dHasChildren) {
                            const dP = dPs[0];
                            yield this._move(session, tree, space, left, +dS + 1);
                            if (parentId)
                                yield this._resize(session, tree, space, pP.left, pP.right, +dS + 1);
                            const chs = yield this.getChs(tree, dP);
                            for (let c = 0; c < chs.length; c++) {
                                const ch = chs[c];
                                const chPs = this.getPositionsByTreeIn(ch, tree, dP.space, dP.left, dP.right);
                                chai.assert.isNotEmpty(chPs, `Unexpected child positions not founded by ${JSON.stringify({ ch, tree, space: dP.space, left: dP.left, right: dP.right })}`);
                                for (let chPi = 0; chPi < chPs.length; chPi++) {
                                    const chP = chPs[chPi];
                                    const chL = chP.left - dP.left;
                                    const chS = chP.right - chP.left;
                                    const chD = chP.depth - dP.depth;
                                    yield this._push(session, ch._id, {
                                        _id: new mongodb_1.ObjectID(),
                                        parentId: chP.parentId,
                                        tree, space,
                                        left: chL + left,
                                        right: chL + left + chS,
                                        depth: chD + depth,
                                    });
                                }
                            }
                            if (!parentId)
                                yield this._unlast(session, tree, space);
                            yield this._push(session, d._id, {
                                _id: new mongodb_1.ObjectID(),
                                parentId, tree, space, left, right, depth, last,
                            });
                        }
                        else {
                            yield this._move(session, tree, space, left, +dS + 1);
                            if (parentId)
                                yield this._resize(session, tree, space, pP.left, pP.right, +dS + 1);
                            if (!parentId)
                                yield this._unlast(session, tree, space);
                            yield this._push(session, docId, {
                                _id: new mongodb_1.ObjectID(),
                                parentId, tree, space, left, right, depth, last,
                            });
                        }
                    }
                    else {
                        yield this._move(session, tree, space, left, +dS + 1);
                        if (parentId)
                            yield this._resize(session, tree, space, pP.left, pP.right, +dS + 1);
                        if (!parentId)
                            yield this._unlast(session, tree, space);
                        yield this._push(session, docId, {
                            _id: new mongodb_1.ObjectID(),
                            parentId, tree, space, left, right, depth, last,
                        });
                    }
                    yield session.commitTransaction();
                }
                yield session.endSession();
            }
            catch (error) {
                if (session.transaction.state != 'NO_TRANSACTION')
                    yield session.abortTransaction();
                yield session.endSession();
                throw error;
            }
        });
    }
    pull(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const session = this.client.startSession();
            try {
                const { c, field, } = this;
                chai.assert.isObject(options);
                const { positionId, docId, parentId, tree } = options;
                let d, dPs;
                if (positionId && !docId && !parentId && !tree) {
                    d = yield c.findOne({
                        [field]: { $elemMatch: { _id: positionId } },
                    });
                    chai.assert.exists(d, `Doc is not founded.`);
                    const tdP = this.getPositionByPositionId(d, positionId);
                    chai.assert.exists(tdP, `Doc position is not founded.`);
                    dPs = [tdP];
                }
                else if (!positionId && docId && parentId && tree) {
                    chai.assert.isString(docId);
                    chai.assert.isString(parentId);
                    chai.assert.isString(tree);
                    d = yield c.findOne({ _id: docId });
                    chai.assert.exists(d, `Doc is not founded.`);
                    dPs = this.getPositionsByParentId(d, parentId, tree);
                    chai.assert.isNotEmpty(dPs, `Positions in parentId ${parentId} of doc not founded`);
                }
                else {
                    throw new Error(`Must be (positionId) or (docId and parentId and tree), not both.`);
                }
                for (let dPi = 0; dPi < dPs.length; dPi++) {
                    yield session.startTransaction();
                    const dP = yield this.regetPos(d._id, dPs[dPi]._id);
                    if (dP.last)
                        yield this._last(session, dP.tree, dP.space, dP.left - 1);
                    yield this._pull(session, dP.tree, dP.space, dP.left, dP.right, dP.depth);
                    if (dP.parentId)
                        yield this._resize(session, dP.tree, dP.space, dP.left, dP.right, -((dP.right - dP.left) + 1));
                    yield this._move(session, dP.tree, dP.space, dP.left, -((dP.right - dP.left) + 1));
                    yield session.commitTransaction();
                }
                yield session.endSession();
            }
            catch (error) {
                if (session.transaction.state != 'NO_TRANSACTION')
                    yield session.abortTransaction();
                yield session.endSession();
                throw error;
            }
        });
    }
    name(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const { c, field, } = this;
            const { positionId, parentId, tree, docId, name } = options;
            const doc = yield c.findOne({ _id: docId });
            if (!doc)
                throw new Error(`Doc ${docId} not founded`);
            let $set = {};
            if (parentId && tree) {
                chai.assert.isString(parentId, 'Option parentId must be a string.');
                chai.assert.isString(tree, 'Option tree must be a string.');
                for (let p = 0; p < doc[field].length; p++) {
                    if (String(doc[field][p].parentId) === String(parentId) && doc[field][p].tree === tree) {
                        $set[`${field}.${p}.name`] = name;
                    }
                }
            }
            else if (positionId) {
                for (let p = 0; p < doc[field].length; p++) {
                    if (String(doc[field][p]._id) === (positionId)) {
                        if (doc[field][p].parentId) {
                            for (let pa = 0; pa < doc[field].length; pa++) {
                                if (String(doc[field][pa].parentId) === String(doc[field][p].parentId) && doc[field][pa].tree === doc[field][p].tree) {
                                    $set[`${field}.${pa}.name`] = name;
                                }
                            }
                        }
                        else {
                            $set[`${field}.${p}.name`] = name;
                        }
                        break;
                    }
                }
            }
            else
                throw new Error(`Options parentId (${parentId ? '+' : '-'}) and tree (${tree ? '+' : '-'}) or positionId (${positionId ? '+' : '-'}) must be defined.`);
            if (!_.isEmpty($set))
                c.updateOne({ _id: docId }, { $set });
        });
    }
}
exports.NestedSets = NestedSets;
//# sourceMappingURL=index.js.map