var EventTarget = function () {
    this.listeners = {};
};

EventTarget.prototype.listeners = null;
EventTarget.prototype.on = EventTarget.prototype.addEventListener = function (type, callback) {
    if (!(type in this.listeners)) {
        this.listeners[type] = [];
    }
    this.listeners[type].push(callback);
};

EventTarget.prototype.off = EventTarget.prototype.removeEventListener = function (type, callback) {
    if (!(type in this.listeners)) {
        return;
    }
    var stack = this.listeners[type];
    for (var i = 0, l = stack.length; i < l; i++) {
        if (stack[i] === callback) {
            stack.splice(i, 1);
            return;
        }
    }
};

EventTarget.prototype.fire = EventTarget.prototype.dispatchEvent = async function (event) {
    if (!(event.type in this.listeners)) {
        return true;
    }
    var stack = this.listeners[event.type];
    // event.target = this;
    for (var i = 0, l = stack.length; i < l; i++) {
        let result = await stack[i].call(this, event);
        if (result === false) {
            return false;
        }
    }
    return !event.defaultPrevented;
};

EventTarget.prototype.quick_fire = function (type, data) {
    return this.fire(new CustomEvent(type, {detail: data}))
}

export {
    EventTarget,
}