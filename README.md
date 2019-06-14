# mongo-nested-sets

Mongo nested sets realisation.

[![NPM](https://img.shields.io/npm/v/mongo-nested-sets.svg)](https://www.npmjs.com/package/mongo-nested-sets)
[![Build Status](https://travis-ci.org/menzorg/mongo-nested-sets.svg?branch=master)](https://travis-ci.org/menzorg/mongo-nested-sets)

## Install

```bash
npm i mongo-nested-sets
```

***
## Tests

Tests can be started with comand `export MONGO_URL="yourMongoUrl" && npm install && npm run retest` in work catalog.

``For more information lern `` [src/tests/index.js](https://github.com/Menzorg/mongo-nested-sets/src/tests/index.ts)
***
## Example
### npm style
```js
import { MongoClient } from 'mongodb';
import { NestedSets } from 'mongo-nested-sets';

const ns = new NestedSets();
MongoClient.connect(process.env.MONGO_URL,{ useNewUrlParser: true }, function(err, client) {
    ns.init({
        collection: client.db('yourDB').collection('yourCollection'),
        field: "yourField",
        client,
    });
    //do everything;
});
```

### meteor style
```js
import { Meteor } from 'meteor/meteor';
import { NestedSets } from 'mongo-nested-sets';

const ns = new NestedSets();
ns.init({
    collection: Meteor["yourCollection"],
    field: "yourField",
    client: Meteor["yourCollection"]._driver.mongo.client,
});
//do everything;
```