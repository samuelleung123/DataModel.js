import localforage from "localforage";
import {EventTarget} from "./EventEmitter";
import {async_timeout} from "./utils";

class DB {
    static db_map = new Map();
    instance = null;
    schedule = {};
    pk_map = null;
    id = null

    constructor(instance) {
        this.instance = instance;
        this.id = Math.random();
    }

    async getItem() {
        return this.instance.getItem(...arguments);
    }

    async removeItem() {
        return this.instance.removeItem(...arguments);
    }

    async setItem(key, value) {
        if (this.schedule[key] == null) {
            this.schedule[key] = 0;
        }
        this.schedule[key] += 1;
        await async_timeout();
        this.schedule[key]--;

        if (this.schedule[key] === 0) {
            return this.instance.setItem(key, value);
        }
    }

    static get_db(db_name) {
        let db_map = this.db_map;
        if (!db_map.has(db_name)) {
            let instance = localforage.createInstance({
                name: db_name,
                storeName: db_name,
            });
            let db = new DB(instance);
            db_map.set(db_name, db);
        }

        return db_map.get(db_name);
    }

    async generate_pk(table) {
        if (!this.pk_map) {
            this.pk_map = (await this.getItem('pk_map')) || {};
        }

        if (!this.pk_map[table]) {
            this.pk_map[table] = 0;
        }
        await async_timeout();
        this.pk_map[table] += 1;
        let id = this.pk_map[table];
        this.setItem('pk_map', this.pk_map);
        return id;
    }

}


class DataModel {
    static db_name = 'data_model';
    static table;
    static primary_key;
    static map;
    static save_schedule = 0;
    static query_schedule = [];

    static get db() {
        return DB.get_db(this.db_name);
    }

    static class_events = new EventTarget();
    model_events = new EventTarget();

    old_attributes = {};
    non_attributes = [];


    static set_db(db_name) {
        this.db_name = db_name;
    }

    constructor(props = {}) {
        for (let k in this) {
            this.non_attributes.push(k);
        }
        this.old_attributes = {...props};

        Object.entries(props).forEach(([k, v]) => this[k] = v)

    }

    static get_db() {
        return this.db
    }

    get attributes() {
        let attributes = {};

        for (const attr in this) {
            if (!this.non_attributes.includes(attr)) {
                attributes[attr] = this[attr];
            }
        }

        return attributes;
    }

    /**
     *
     * @returns {Promise<Map>}
     */
    static async get_map() {

        if (this.map == null) {
            console.log('new map')
            let map = new Map();
            this.map = map;
            let db = this.db;

            let list = await db.getItem(this.table);
            if (list == null) {
                list = [];
            }
            list.forEach(item => map.set(parseInt(item[this.primary_key]), item));
        }

        return this.map;
    }

    async save() {
        let {primary_key, table} = this.constructor;

        if (this[primary_key] == null) {
            this[primary_key] = await this.constructor.db.generate_pk(table);
        }

        let attributes = {...this.attributes};
        let map = (await this.constructor.get_map());
        map.set(this[primary_key], attributes);

        this.old_attributes = {...attributes};

        this.fire_event('save', {model: this});

        return this.constructor.real_save();
    }

    async fire_event(type, data, emitter = null) {
        if (emitter !== null) {
            emitter.quick_fire(type, data);
            return;
        }
        this.constructor.class_events.quick_fire(type, data);
        this.model_events.quick_fire(type, data);
    }


    static async real_save() {
        this.save_schedule++;
        await async_timeout();
        this.save_schedule--;

        if (this.save_schedule === 0) {
            this.db.setItem(this.table, (await this.query()).map(model => model.attributes));
            console.log('real_save');
        }
    }

    async delete() {
        let map = await this.constructor.get_map();
        map.delete(this[this.constructor.primary_key]);
        return this.constructor.real_save();
    }

    static async get_by_id(id) {
        let map = await this.get_map()
        let data = map.get(parseInt(id));

        if (data == null) {
            console.error(this.table, id, 'not found')
            return null;
        }

        return new this(data);
    }

    /**
     * @param {(value: *, index: number, array: *[]) => *} filter_cb
     * @returns {Promise<Array>}
     */
    static async query(filter_cb = null) {
        let key = Math.random();
        this.query_schedule.push(key)
        while (true) {
            await async_timeout();
            if (this.query_schedule[0] === key) {
                return new Promise(async (resolve) => {

                    let list = [];
                    let map = await this.get_map();

                    for (let model of map.values()) {
                        list.push(new this(model));
                    }
                    let pk = this.primary_key;

                    list = list.sort((a, b) => parseInt(a[pk]) - parseInt(b[pk]));

                    if (filter_cb) {
                        list = list.filter(filter_cb);
                    }

                    this.query_schedule.shift();
                    resolve(list);
                });
            }
        }
    }

}


export {
    DataModel,
    localforage,
}