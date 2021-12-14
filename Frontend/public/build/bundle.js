
(function(l, r) { if (l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (window.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(window.document);
var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function validate_store(store, name) {
        if (store != null && typeof store.subscribe !== 'function') {
            throw new Error(`'${name}' is not a store with a 'subscribe' method`);
        }
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot_base(slot, slot_definition, ctx, $$scope, slot_changes, get_slot_context_fn) {
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }
    function get_all_dirty_from_scope($$scope) {
        if ($$scope.ctx.length > 32) {
            const dirty = [];
            const length = $$scope.ctx.length / 32;
            for (let i = 0; i < length; i++) {
                dirty[i] = -1;
            }
            return dirty;
        }
        return -1;
    }
    function exclude_internal_props(props) {
        const result = {};
        for (const k in props)
            if (k[0] !== '$')
                result[k] = props[k];
        return result;
    }
    function null_to_empty(value) {
        return value == null ? '' : value;
    }
    function action_destroyer(action_result) {
        return action_result && is_function(action_result.destroy) ? action_result.destroy : noop;
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    // Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
    // at the end of hydration without touching the remaining nodes.
    let is_hydrating = false;
    function start_hydrating() {
        is_hydrating = true;
    }
    function end_hydrating() {
        is_hydrating = false;
    }
    function upper_bound(low, high, key, value) {
        // Return first index of value larger than input value in the range [low, high)
        while (low < high) {
            const mid = low + ((high - low) >> 1);
            if (key(mid) <= value) {
                low = mid + 1;
            }
            else {
                high = mid;
            }
        }
        return low;
    }
    function init_hydrate(target) {
        if (target.hydrate_init)
            return;
        target.hydrate_init = true;
        // We know that all children have claim_order values since the unclaimed have been detached if target is not <head>
        let children = target.childNodes;
        // If target is <head>, there may be children without claim_order
        if (target.nodeName === 'HEAD') {
            const myChildren = [];
            for (let i = 0; i < children.length; i++) {
                const node = children[i];
                if (node.claim_order !== undefined) {
                    myChildren.push(node);
                }
            }
            children = myChildren;
        }
        /*
        * Reorder claimed children optimally.
        * We can reorder claimed children optimally by finding the longest subsequence of
        * nodes that are already claimed in order and only moving the rest. The longest
        * subsequence subsequence of nodes that are claimed in order can be found by
        * computing the longest increasing subsequence of .claim_order values.
        *
        * This algorithm is optimal in generating the least amount of reorder operations
        * possible.
        *
        * Proof:
        * We know that, given a set of reordering operations, the nodes that do not move
        * always form an increasing subsequence, since they do not move among each other
        * meaning that they must be already ordered among each other. Thus, the maximal
        * set of nodes that do not move form a longest increasing subsequence.
        */
        // Compute longest increasing subsequence
        // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
        const m = new Int32Array(children.length + 1);
        // Predecessor indices + 1
        const p = new Int32Array(children.length);
        m[0] = -1;
        let longest = 0;
        for (let i = 0; i < children.length; i++) {
            const current = children[i].claim_order;
            // Find the largest subsequence length such that it ends in a value less than our current value
            // upper_bound returns first greater value, so we subtract one
            // with fast path for when we are on the current longest subsequence
            const seqLen = ((longest > 0 && children[m[longest]].claim_order <= current) ? longest + 1 : upper_bound(1, longest, idx => children[m[idx]].claim_order, current)) - 1;
            p[i] = m[seqLen] + 1;
            const newLen = seqLen + 1;
            // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
            m[newLen] = i;
            longest = Math.max(newLen, longest);
        }
        // The longest increasing subsequence of nodes (initially reversed)
        const lis = [];
        // The rest of the nodes, nodes that will be moved
        const toMove = [];
        let last = children.length - 1;
        for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
            lis.push(children[cur - 1]);
            for (; last >= cur; last--) {
                toMove.push(children[last]);
            }
            last--;
        }
        for (; last >= 0; last--) {
            toMove.push(children[last]);
        }
        lis.reverse();
        // We sort the nodes being moved to guarantee that their insertion order matches the claim order
        toMove.sort((a, b) => a.claim_order - b.claim_order);
        // Finally, we move the nodes
        for (let i = 0, j = 0; i < toMove.length; i++) {
            while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
                j++;
            }
            const anchor = j < lis.length ? lis[j] : null;
            target.insertBefore(toMove[i], anchor);
        }
    }
    function append(target, node) {
        target.appendChild(node);
    }
    function get_root_for_style(node) {
        if (!node)
            return document;
        const root = node.getRootNode ? node.getRootNode() : node.ownerDocument;
        if (root && root.host) {
            return root;
        }
        return node.ownerDocument;
    }
    function append_empty_stylesheet(node) {
        const style_element = element('style');
        append_stylesheet(get_root_for_style(node), style_element);
        return style_element;
    }
    function append_stylesheet(node, style) {
        append(node.head || node, style);
    }
    function append_hydration(target, node) {
        if (is_hydrating) {
            init_hydrate(target);
            if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentElement !== target))) {
                target.actual_end_child = target.firstChild;
            }
            // Skip nodes of undefined ordering
            while ((target.actual_end_child !== null) && (target.actual_end_child.claim_order === undefined)) {
                target.actual_end_child = target.actual_end_child.nextSibling;
            }
            if (node !== target.actual_end_child) {
                // We only insert if the ordering of this node should be modified or the parent node is not target
                if (node.claim_order !== undefined || node.parentNode !== target) {
                    target.insertBefore(node, target.actual_end_child);
                }
            }
            else {
                target.actual_end_child = node.nextSibling;
            }
        }
        else if (node.parentNode !== target || node.nextSibling !== null) {
            target.appendChild(node);
        }
    }
    function insert_hydration(target, node, anchor) {
        if (is_hydrating && !anchor) {
            append_hydration(target, node);
        }
        else if (node.parentNode !== target || node.nextSibling != anchor) {
            target.insertBefore(node, anchor || null);
        }
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function prevent_default(fn) {
        return function (event) {
            event.preventDefault();
            // @ts-ignore
            return fn.call(this, event);
        };
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function init_claim_info(nodes) {
        if (nodes.claim_info === undefined) {
            nodes.claim_info = { last_index: 0, total_claimed: 0 };
        }
    }
    function claim_node(nodes, predicate, processNode, createNode, dontUpdateLastIndex = false) {
        // Try to find nodes in an order such that we lengthen the longest increasing subsequence
        init_claim_info(nodes);
        const resultNode = (() => {
            // We first try to find an element after the previous one
            for (let i = nodes.claim_info.last_index; i < nodes.length; i++) {
                const node = nodes[i];
                if (predicate(node)) {
                    const replacement = processNode(node);
                    if (replacement === undefined) {
                        nodes.splice(i, 1);
                    }
                    else {
                        nodes[i] = replacement;
                    }
                    if (!dontUpdateLastIndex) {
                        nodes.claim_info.last_index = i;
                    }
                    return node;
                }
            }
            // Otherwise, we try to find one before
            // We iterate in reverse so that we don't go too far back
            for (let i = nodes.claim_info.last_index - 1; i >= 0; i--) {
                const node = nodes[i];
                if (predicate(node)) {
                    const replacement = processNode(node);
                    if (replacement === undefined) {
                        nodes.splice(i, 1);
                    }
                    else {
                        nodes[i] = replacement;
                    }
                    if (!dontUpdateLastIndex) {
                        nodes.claim_info.last_index = i;
                    }
                    else if (replacement === undefined) {
                        // Since we spliced before the last_index, we decrease it
                        nodes.claim_info.last_index--;
                    }
                    return node;
                }
            }
            // If we can't find any matching node, we create a new one
            return createNode();
        })();
        resultNode.claim_order = nodes.claim_info.total_claimed;
        nodes.claim_info.total_claimed += 1;
        return resultNode;
    }
    function claim_element_base(nodes, name, attributes, create_element) {
        return claim_node(nodes, (node) => node.nodeName === name, (node) => {
            const remove = [];
            for (let j = 0; j < node.attributes.length; j++) {
                const attribute = node.attributes[j];
                if (!attributes[attribute.name]) {
                    remove.push(attribute.name);
                }
            }
            remove.forEach(v => node.removeAttribute(v));
            return undefined;
        }, () => create_element(name));
    }
    function claim_element(nodes, name, attributes) {
        return claim_element_base(nodes, name, attributes, element);
    }
    function claim_svg_element(nodes, name, attributes) {
        return claim_element_base(nodes, name, attributes, svg_element);
    }
    function claim_text(nodes, data) {
        return claim_node(nodes, (node) => node.nodeType === 3, (node) => {
            const dataStr = '' + data;
            if (node.data.startsWith(dataStr)) {
                if (node.data.length !== dataStr.length) {
                    return node.splitText(dataStr.length);
                }
            }
            else {
                node.data = dataStr;
            }
        }, () => text(data), true // Text nodes should not update last index since it is likely not worth it to eliminate an increasing subsequence of actual elements
        );
    }
    function claim_space(nodes) {
        return claim_text(nodes, ' ');
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function custom_event(type, detail, bubbles = false) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, false, detail);
        return e;
    }

    const active_docs = new Set();
    let active = 0;
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        const doc = get_root_for_style(node);
        active_docs.add(doc);
        const stylesheet = doc.__svelte_stylesheet || (doc.__svelte_stylesheet = append_empty_stylesheet(node).sheet);
        const current_rules = doc.__svelte_rules || (doc.__svelte_rules = {});
        if (!current_rules[name]) {
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ''}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        const previous = (node.style.animation || '').split(', ');
        const next = previous.filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        );
        const deleted = previous.length - next.length;
        if (deleted) {
            node.style.animation = next.join(', ');
            active -= deleted;
            if (!active)
                clear_rules();
        }
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            active_docs.forEach(doc => {
                const stylesheet = doc.__svelte_stylesheet;
                let i = stylesheet.cssRules.length;
                while (i--)
                    stylesheet.deleteRule(i);
                doc.__svelte_rules = {};
            });
            active_docs.clear();
        });
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function afterUpdate(fn) {
        get_current_component().$$.after_update.push(fn);
    }
    function onDestroy(fn) {
        get_current_component().$$.on_destroy.push(fn);
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }
    function setContext(key, context) {
        get_current_component().$$.context.set(key, context);
    }
    function getContext(key) {
        return get_current_component().$$.context.get(key);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_in_transition(node, fn, params) {
        let config = fn(node, params);
        let running = false;
        let animation_name;
        let task;
        let uid = 0;
        function cleanup() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 0, 1, duration, delay, easing, css, uid++);
            tick(0, 1);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            if (task)
                task.abort();
            running = true;
            add_render_callback(() => dispatch(node, true, 'start'));
            task = loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(1, 0);
                        dispatch(node, true, 'end');
                        cleanup();
                        return running = false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(t, 1 - t);
                    }
                }
                return running;
            });
        }
        let started = false;
        return {
            start() {
                if (started)
                    return;
                started = true;
                delete_rule(node);
                if (is_function(config)) {
                    config = config();
                    wait().then(go);
                }
                else {
                    go();
                }
            },
            invalidate() {
                started = false;
            },
            end() {
                if (running) {
                    cleanup();
                    running = false;
                }
            }
        };
    }
    function create_out_transition(node, fn, params) {
        let config = fn(node, params);
        let running = true;
        let animation_name;
        const group = outros;
        group.r += 1;
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 1, 0, duration, delay, easing, css);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            add_render_callback(() => dispatch(node, false, 'start'));
            loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(0, 1);
                        dispatch(node, false, 'end');
                        if (!--group.r) {
                            // this will result in `end()` being called,
                            // so we don't need to clean up here
                            run_all(group.c);
                        }
                        return false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(1 - t, t);
                    }
                }
                return running;
            });
        }
        if (is_function(config)) {
            wait().then(() => {
                // @ts-ignore
                config = config();
                go();
            });
        }
        else {
            go();
        }
        return {
            end(reset) {
                if (reset && config.tick) {
                    config.tick(1, 0);
                }
                if (running) {
                    if (animation_name)
                        delete_rule(node, animation_name);
                    running = false;
                }
            }
        };
    }
    function create_bidirectional_transition(node, fn, params, intro) {
        let config = fn(node, params);
        let t = intro ? 0 : 1;
        let running_program = null;
        let pending_program = null;
        let animation_name = null;
        function clear_animation() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function init(program, duration) {
            const d = (program.b - t);
            duration *= Math.abs(d);
            return {
                a: t,
                b: program.b,
                d,
                duration,
                start: program.start,
                end: program.start + duration,
                group: program.group
            };
        }
        function go(b) {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            const program = {
                start: now() + delay,
                b
            };
            if (!b) {
                // @ts-ignore todo: improve typings
                program.group = outros;
                outros.r += 1;
            }
            if (running_program || pending_program) {
                pending_program = program;
            }
            else {
                // if this is an intro, and there's a delay, we need to do
                // an initial tick and/or apply CSS animation immediately
                if (css) {
                    clear_animation();
                    animation_name = create_rule(node, t, b, duration, delay, easing, css);
                }
                if (b)
                    tick(0, 1);
                running_program = init(program, duration);
                add_render_callback(() => dispatch(node, b, 'start'));
                loop(now => {
                    if (pending_program && now > pending_program.start) {
                        running_program = init(pending_program, duration);
                        pending_program = null;
                        dispatch(node, running_program.b, 'start');
                        if (css) {
                            clear_animation();
                            animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
                        }
                    }
                    if (running_program) {
                        if (now >= running_program.end) {
                            tick(t = running_program.b, 1 - t);
                            dispatch(node, running_program.b, 'end');
                            if (!pending_program) {
                                // we're done
                                if (running_program.b) {
                                    // intro — we can tidy up immediately
                                    clear_animation();
                                }
                                else {
                                    // outro — needs to be coordinated
                                    if (!--running_program.group.r)
                                        run_all(running_program.group.c);
                                }
                            }
                            running_program = null;
                        }
                        else if (now >= running_program.start) {
                            const p = now - running_program.start;
                            t = running_program.a + running_program.d * easing(p / running_program.duration);
                            tick(t, 1 - t);
                        }
                    }
                    return !!(running_program || pending_program);
                });
            }
        }
        return {
            run(b) {
                if (is_function(config)) {
                    wait().then(() => {
                        // @ts-ignore
                        config = config();
                        go(b);
                    });
                }
                else {
                    go(b);
                }
            },
            end() {
                clear_animation();
                running_program = pending_program = null;
            }
        };
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);

    function get_spread_update(levels, updates) {
        const update = {};
        const to_null_out = {};
        const accounted_for = { $$scope: 1 };
        let i = levels.length;
        while (i--) {
            const o = levels[i];
            const n = updates[i];
            if (n) {
                for (const key in o) {
                    if (!(key in n))
                        to_null_out[key] = 1;
                }
                for (const key in n) {
                    if (!accounted_for[key]) {
                        update[key] = n[key];
                        accounted_for[key] = 1;
                    }
                }
                levels[i] = n;
            }
            else {
                for (const key in o) {
                    accounted_for[key] = 1;
                }
            }
        }
        for (const key in to_null_out) {
            if (!(key in update))
                update[key] = undefined;
        }
        return update;
    }
    function get_spread_object(spread_props) {
        return typeof spread_props === 'object' && spread_props !== null ? spread_props : {};
    }

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function claim_component(block, parent_nodes) {
        block && block.l(parent_nodes);
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                start_hydrating();
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            end_hydrating();
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.44.2' }, detail), true));
    }
    function append_hydration_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append_hydration(target, node);
    }
    function insert_hydration_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert_hydration(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev('SvelteDOMSetData', { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

    function unwrapExports (x) {
    	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
    }

    function createCommonjsModule(fn, basedir, module) {
    	return module = {
    	  path: basedir,
    	  exports: {},
    	  require: function (path, base) {
          return commonjsRequire(path, (base === undefined || base === null) ? module.path : base);
        }
    	}, fn(module, module.exports), module.exports;
    }

    function commonjsRequire () {
    	throw new Error('Dynamic requires are not currently supported by @rollup/plugin-commonjs');
    }

    var pjs = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.initPjs = void 0;
    const initPjs = (main) => {
        const particlesJS = (tagId, options) => {
            return main.load(tagId, options);
        };
        particlesJS.load = (tagId, pathConfigJson, callback) => {
            main.loadJSON(tagId, pathConfigJson)
                .then((container) => {
                if (container) {
                    callback(container);
                }
            })
                .catch(() => {
                callback(undefined);
            });
        };
        particlesJS.setOnClickHandler = (callback) => {
            main.setOnClickHandler(callback);
        };
        const pJSDom = main.dom();
        return { particlesJS, pJSDom };
    };
    exports.initPjs = initPjs;
    });

    unwrapExports(pjs);
    pjs.initPjs;

    var MoveDirection_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MoveDirection = void 0;
    (function (MoveDirection) {
        MoveDirection["bottom"] = "bottom";
        MoveDirection["bottomLeft"] = "bottom-left";
        MoveDirection["bottomRight"] = "bottom-right";
        MoveDirection["left"] = "left";
        MoveDirection["none"] = "none";
        MoveDirection["right"] = "right";
        MoveDirection["top"] = "top";
        MoveDirection["topLeft"] = "top-left";
        MoveDirection["topRight"] = "top-right";
    })(exports.MoveDirection || (exports.MoveDirection = {}));
    });

    unwrapExports(MoveDirection_1);
    MoveDirection_1.MoveDirection;

    var RotateDirection_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.RotateDirection = void 0;
    (function (RotateDirection) {
        RotateDirection["clockwise"] = "clockwise";
        RotateDirection["counterClockwise"] = "counter-clockwise";
        RotateDirection["random"] = "random";
    })(exports.RotateDirection || (exports.RotateDirection = {}));
    });

    unwrapExports(RotateDirection_1);
    RotateDirection_1.RotateDirection;

    var OutModeDirection_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.OutModeDirection = void 0;
    (function (OutModeDirection) {
        OutModeDirection["bottom"] = "bottom";
        OutModeDirection["left"] = "left";
        OutModeDirection["right"] = "right";
        OutModeDirection["top"] = "top";
    })(exports.OutModeDirection || (exports.OutModeDirection = {}));
    });

    unwrapExports(OutModeDirection_1);
    OutModeDirection_1.OutModeDirection;

    var TiltDirection_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.TiltDirection = void 0;
    (function (TiltDirection) {
        TiltDirection["clockwise"] = "clockwise";
        TiltDirection["counterClockwise"] = "counter-clockwise";
        TiltDirection["random"] = "random";
    })(exports.TiltDirection || (exports.TiltDirection = {}));
    });

    unwrapExports(TiltDirection_1);
    TiltDirection_1.TiltDirection;

    var Directions = createCommonjsModule(function (module, exports) {
    var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
    }) : (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
    }));
    var __exportStar = (commonjsGlobal && commonjsGlobal.__exportStar) || function(m, exports) {
        for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    __exportStar(MoveDirection_1, exports);
    __exportStar(RotateDirection_1, exports);
    __exportStar(OutModeDirection_1, exports);
    __exportStar(TiltDirection_1, exports);
    });

    unwrapExports(Directions);

    var ClickMode_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ClickMode = void 0;
    (function (ClickMode) {
        ClickMode["attract"] = "attract";
        ClickMode["bubble"] = "bubble";
        ClickMode["push"] = "push";
        ClickMode["remove"] = "remove";
        ClickMode["repulse"] = "repulse";
        ClickMode["pause"] = "pause";
        ClickMode["trail"] = "trail";
    })(exports.ClickMode || (exports.ClickMode = {}));
    });

    unwrapExports(ClickMode_1);
    ClickMode_1.ClickMode;

    var DestroyMode_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DestroyMode = void 0;
    (function (DestroyMode) {
        DestroyMode["none"] = "none";
        DestroyMode["split"] = "split";
    })(exports.DestroyMode || (exports.DestroyMode = {}));
    });

    unwrapExports(DestroyMode_1);
    DestroyMode_1.DestroyMode;

    var DivMode_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DivMode = void 0;
    (function (DivMode) {
        DivMode["bounce"] = "bounce";
        DivMode["bubble"] = "bubble";
        DivMode["repulse"] = "repulse";
    })(exports.DivMode || (exports.DivMode = {}));
    });

    unwrapExports(DivMode_1);
    DivMode_1.DivMode;

    var HoverMode_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.HoverMode = void 0;
    (function (HoverMode) {
        HoverMode["attract"] = "attract";
        HoverMode["bounce"] = "bounce";
        HoverMode["bubble"] = "bubble";
        HoverMode["connect"] = "connect";
        HoverMode["grab"] = "grab";
        HoverMode["light"] = "light";
        HoverMode["repulse"] = "repulse";
        HoverMode["slow"] = "slow";
        HoverMode["trail"] = "trail";
    })(exports.HoverMode || (exports.HoverMode = {}));
    });

    unwrapExports(HoverMode_1);
    HoverMode_1.HoverMode;

    var CollisionMode_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CollisionMode = void 0;
    (function (CollisionMode) {
        CollisionMode["absorb"] = "absorb";
        CollisionMode["bounce"] = "bounce";
        CollisionMode["destroy"] = "destroy";
    })(exports.CollisionMode || (exports.CollisionMode = {}));
    });

    unwrapExports(CollisionMode_1);
    CollisionMode_1.CollisionMode;

    var OutMode_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.OutMode = void 0;
    (function (OutMode) {
        OutMode["bounce"] = "bounce";
        OutMode["bounceHorizontal"] = "bounce-horizontal";
        OutMode["bounceVertical"] = "bounce-vertical";
        OutMode["none"] = "none";
        OutMode["out"] = "out";
        OutMode["destroy"] = "destroy";
        OutMode["split"] = "split";
    })(exports.OutMode || (exports.OutMode = {}));
    });

    unwrapExports(OutMode_1);
    OutMode_1.OutMode;

    var RollMode_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.RollMode = void 0;
    (function (RollMode) {
        RollMode["both"] = "both";
        RollMode["horizontal"] = "horizontal";
        RollMode["vertical"] = "vertical";
    })(exports.RollMode || (exports.RollMode = {}));
    });

    unwrapExports(RollMode_1);
    RollMode_1.RollMode;

    var SizeMode_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SizeMode = void 0;
    (function (SizeMode) {
        SizeMode["precise"] = "precise";
        SizeMode["percent"] = "percent";
    })(exports.SizeMode || (exports.SizeMode = {}));
    });

    unwrapExports(SizeMode_1);
    SizeMode_1.SizeMode;

    var ThemeMode_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ThemeMode = void 0;
    (function (ThemeMode) {
        ThemeMode["any"] = "any";
        ThemeMode["dark"] = "dark";
        ThemeMode["light"] = "light";
    })(exports.ThemeMode || (exports.ThemeMode = {}));
    });

    unwrapExports(ThemeMode_1);
    ThemeMode_1.ThemeMode;

    var ResponsiveMode_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ResponsiveMode = void 0;
    (function (ResponsiveMode) {
        ResponsiveMode["screen"] = "screen";
        ResponsiveMode["canvas"] = "canvas";
    })(exports.ResponsiveMode || (exports.ResponsiveMode = {}));
    });

    unwrapExports(ResponsiveMode_1);
    ResponsiveMode_1.ResponsiveMode;

    var Modes = createCommonjsModule(function (module, exports) {
    var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
    }) : (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
    }));
    var __exportStar = (commonjsGlobal && commonjsGlobal.__exportStar) || function(m, exports) {
        for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    __exportStar(ClickMode_1, exports);
    __exportStar(DestroyMode_1, exports);
    __exportStar(DivMode_1, exports);
    __exportStar(HoverMode_1, exports);
    __exportStar(CollisionMode_1, exports);
    __exportStar(OutMode_1, exports);
    __exportStar(RollMode_1, exports);
    __exportStar(SizeMode_1, exports);
    __exportStar(ThemeMode_1, exports);
    __exportStar(ResponsiveMode_1, exports);
    });

    unwrapExports(Modes);

    var AnimationStatus_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AnimationStatus = void 0;
    (function (AnimationStatus) {
        AnimationStatus[AnimationStatus["increasing"] = 0] = "increasing";
        AnimationStatus[AnimationStatus["decreasing"] = 1] = "decreasing";
    })(exports.AnimationStatus || (exports.AnimationStatus = {}));
    });

    unwrapExports(AnimationStatus_1);
    AnimationStatus_1.AnimationStatus;

    var AlterType_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AlterType = void 0;
    (function (AlterType) {
        AlterType["darken"] = "darken";
        AlterType["enlighten"] = "enlighten";
    })(exports.AlterType || (exports.AlterType = {}));
    });

    unwrapExports(AlterType_1);
    AlterType_1.AlterType;

    var DestroyType_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DestroyType = void 0;
    (function (DestroyType) {
        DestroyType["none"] = "none";
        DestroyType["max"] = "max";
        DestroyType["min"] = "min";
    })(exports.DestroyType || (exports.DestroyType = {}));
    });

    unwrapExports(DestroyType_1);
    DestroyType_1.DestroyType;

    var GradientType_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.GradientType = void 0;
    (function (GradientType) {
        GradientType["linear"] = "linear";
        GradientType["radial"] = "radial";
        GradientType["random"] = "random";
    })(exports.GradientType || (exports.GradientType = {}));
    });

    unwrapExports(GradientType_1);
    GradientType_1.GradientType;

    var InteractorType_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.InteractorType = void 0;
    (function (InteractorType) {
        InteractorType[InteractorType["External"] = 0] = "External";
        InteractorType[InteractorType["Particles"] = 1] = "Particles";
    })(exports.InteractorType || (exports.InteractorType = {}));
    });

    unwrapExports(InteractorType_1);
    InteractorType_1.InteractorType;

    var ShapeType_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ShapeType = void 0;
    (function (ShapeType) {
        ShapeType["char"] = "char";
        ShapeType["character"] = "character";
        ShapeType["circle"] = "circle";
        ShapeType["edge"] = "edge";
        ShapeType["image"] = "image";
        ShapeType["images"] = "images";
        ShapeType["line"] = "line";
        ShapeType["polygon"] = "polygon";
        ShapeType["square"] = "square";
        ShapeType["star"] = "star";
        ShapeType["triangle"] = "triangle";
    })(exports.ShapeType || (exports.ShapeType = {}));
    });

    unwrapExports(ShapeType_1);
    ShapeType_1.ShapeType;

    var StartValueType_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.StartValueType = void 0;
    (function (StartValueType) {
        StartValueType["max"] = "max";
        StartValueType["min"] = "min";
        StartValueType["random"] = "random";
    })(exports.StartValueType || (exports.StartValueType = {}));
    });

    unwrapExports(StartValueType_1);
    StartValueType_1.StartValueType;

    var DivType_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DivType = void 0;
    (function (DivType) {
        DivType["circle"] = "circle";
        DivType["rectangle"] = "rectangle";
    })(exports.DivType || (exports.DivType = {}));
    });

    unwrapExports(DivType_1);
    DivType_1.DivType;

    var EasingType_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.EasingType = void 0;
    (function (EasingType) {
        EasingType["easeOutBack"] = "ease-out-back";
        EasingType["easeOutCirc"] = "ease-out-circ";
        EasingType["easeOutCubic"] = "ease-out-cubic";
        EasingType["easeOutQuad"] = "ease-out-quad";
        EasingType["easeOutQuart"] = "ease-out-quart";
        EasingType["easeOutQuint"] = "ease-out-quint";
        EasingType["easeOutExpo"] = "ease-out-expo";
        EasingType["easeOutSine"] = "ease-out-sine";
    })(exports.EasingType || (exports.EasingType = {}));
    });

    unwrapExports(EasingType_1);
    EasingType_1.EasingType;

    var OrbitType_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.OrbitType = void 0;
    (function (OrbitType) {
        OrbitType["front"] = "front";
        OrbitType["back"] = "back";
    })(exports.OrbitType || (exports.OrbitType = {}));
    });

    unwrapExports(OrbitType_1);
    OrbitType_1.OrbitType;

    var Types$1 = createCommonjsModule(function (module, exports) {
    var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
    }) : (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
    }));
    var __exportStar = (commonjsGlobal && commonjsGlobal.__exportStar) || function(m, exports) {
        for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    __exportStar(AlterType_1, exports);
    __exportStar(DestroyType_1, exports);
    __exportStar(GradientType_1, exports);
    __exportStar(InteractorType_1, exports);
    __exportStar(ShapeType_1, exports);
    __exportStar(StartValueType_1, exports);
    __exportStar(DivType_1, exports);
    __exportStar(EasingType_1, exports);
    __exportStar(OrbitType_1, exports);
    });

    unwrapExports(Types$1);

    var InteractivityDetect_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.InteractivityDetect = void 0;
    (function (InteractivityDetect) {
        InteractivityDetect["canvas"] = "canvas";
        InteractivityDetect["parent"] = "parent";
        InteractivityDetect["window"] = "window";
    })(exports.InteractivityDetect || (exports.InteractivityDetect = {}));
    });

    unwrapExports(InteractivityDetect_1);
    InteractivityDetect_1.InteractivityDetect;

    var Enums$3 = createCommonjsModule(function (module, exports) {
    var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
    }) : (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
    }));
    var __exportStar = (commonjsGlobal && commonjsGlobal.__exportStar) || function(m, exports) {
        for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    __exportStar(Directions, exports);
    __exportStar(Modes, exports);
    __exportStar(AnimationStatus_1, exports);
    __exportStar(Types$1, exports);
    __exportStar(InteractivityDetect_1, exports);
    });

    unwrapExports(Enums$3);

    var Vector_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Vector = void 0;
    class Vector {
        constructor(x, y) {
            let defX, defY;
            if (y === undefined) {
                if (typeof x === "number") {
                    throw new Error("tsParticles - Vector not initialized correctly");
                }
                const coords = x;
                [defX, defY] = [coords.x, coords.y];
            }
            else {
                [defX, defY] = [x, y];
            }
            this.x = defX;
            this.y = defY;
        }
        static clone(source) {
            return Vector.create(source.x, source.y);
        }
        static create(x, y) {
            return new Vector(x, y);
        }
        static get origin() {
            return Vector.create(0, 0);
        }
        get angle() {
            return Math.atan2(this.y, this.x);
        }
        set angle(angle) {
            this.updateFromAngle(angle, this.length);
        }
        get length() {
            return Math.sqrt(this.x ** 2 + this.y ** 2);
        }
        set length(length) {
            this.updateFromAngle(this.angle, length);
        }
        add(v) {
            return Vector.create(this.x + v.x, this.y + v.y);
        }
        addTo(v) {
            this.x += v.x;
            this.y += v.y;
        }
        sub(v) {
            return Vector.create(this.x - v.x, this.y - v.y);
        }
        subFrom(v) {
            this.x -= v.x;
            this.y -= v.y;
        }
        mult(n) {
            return Vector.create(this.x * n, this.y * n);
        }
        multTo(n) {
            this.x *= n;
            this.y *= n;
        }
        div(n) {
            return Vector.create(this.x / n, this.y / n);
        }
        divTo(n) {
            this.x /= n;
            this.y /= n;
        }
        distanceTo(v) {
            return this.sub(v).length;
        }
        getLengthSq() {
            return this.x ** 2 + this.y ** 2;
        }
        distanceToSq(v) {
            return this.sub(v).getLengthSq();
        }
        manhattanDistanceTo(v) {
            return Math.abs(v.x - this.x) + Math.abs(v.y - this.y);
        }
        copy() {
            return Vector.clone(this);
        }
        setTo(velocity) {
            this.x = velocity.x;
            this.y = velocity.y;
        }
        rotate(angle) {
            return Vector.create(this.x * Math.cos(angle) - this.y * Math.sin(angle), this.x * Math.sin(angle) + this.y * Math.cos(angle));
        }
        updateFromAngle(angle, length) {
            this.x = Math.cos(angle) * length;
            this.y = Math.sin(angle) * length;
        }
    }
    exports.Vector = Vector;
    });

    unwrapExports(Vector_1);
    Vector_1.Vector;

    var NumberUtils = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.calcEasing = exports.collisionVelocity = exports.getParticleBaseVelocity = exports.getParticleDirectionAngle = exports.getDistance = exports.getDistances = exports.getValue = exports.setRangeValue = exports.getRangeMax = exports.getRangeMin = exports.getRangeValue = exports.randomInRange = exports.mix = exports.clamp = void 0;


    function clamp(num, min, max) {
        return Math.min(Math.max(num, min), max);
    }
    exports.clamp = clamp;
    function mix(comp1, comp2, weight1, weight2) {
        return Math.floor((comp1 * weight1 + comp2 * weight2) / (weight1 + weight2));
    }
    exports.mix = mix;
    function randomInRange(r) {
        const max = getRangeMax(r);
        let min = getRangeMin(r);
        if (max === min) {
            min = 0;
        }
        return Math.random() * (max - min) + min;
    }
    exports.randomInRange = randomInRange;
    function getRangeValue(value) {
        return typeof value === "number" ? value : randomInRange(value);
    }
    exports.getRangeValue = getRangeValue;
    function getRangeMin(value) {
        return typeof value === "number" ? value : value.min;
    }
    exports.getRangeMin = getRangeMin;
    function getRangeMax(value) {
        return typeof value === "number" ? value : value.max;
    }
    exports.getRangeMax = getRangeMax;
    function setRangeValue(source, value) {
        if (source === value || (value === undefined && typeof source === "number")) {
            return source;
        }
        const min = getRangeMin(source), max = getRangeMax(source);
        return value !== undefined
            ? {
                min: Math.min(min, value),
                max: Math.max(max, value),
            }
            : setRangeValue(min, max);
    }
    exports.setRangeValue = setRangeValue;
    function getValue(options) {
        const random = options.random;
        const { enable, minimumValue } = typeof random === "boolean" ? { enable: random, minimumValue: 0 } : random;
        return enable ? getRangeValue(setRangeValue(options.value, minimumValue)) : getRangeValue(options.value);
    }
    exports.getValue = getValue;
    function getDistances(pointA, pointB) {
        const dx = pointA.x - pointB.x;
        const dy = pointA.y - pointB.y;
        return { dx: dx, dy: dy, distance: Math.sqrt(dx * dx + dy * dy) };
    }
    exports.getDistances = getDistances;
    function getDistance(pointA, pointB) {
        return getDistances(pointA, pointB).distance;
    }
    exports.getDistance = getDistance;
    function getParticleDirectionAngle(direction) {
        if (typeof direction === "number") {
            return (direction * Math.PI) / 180;
        }
        else {
            switch (direction) {
                case Enums$3.MoveDirection.top:
                    return -Math.PI / 2;
                case Enums$3.MoveDirection.topRight:
                    return -Math.PI / 4;
                case Enums$3.MoveDirection.right:
                    return 0;
                case Enums$3.MoveDirection.bottomRight:
                    return Math.PI / 4;
                case Enums$3.MoveDirection.bottom:
                    return Math.PI / 2;
                case Enums$3.MoveDirection.bottomLeft:
                    return (3 * Math.PI) / 4;
                case Enums$3.MoveDirection.left:
                    return Math.PI;
                case Enums$3.MoveDirection.topLeft:
                    return (-3 * Math.PI) / 4;
                case Enums$3.MoveDirection.none:
                default:
                    return Math.random() * Math.PI * 2;
            }
        }
    }
    exports.getParticleDirectionAngle = getParticleDirectionAngle;
    function getParticleBaseVelocity(direction) {
        const baseVelocity = Vector_1.Vector.origin;
        baseVelocity.length = 1;
        baseVelocity.angle = direction;
        return baseVelocity;
    }
    exports.getParticleBaseVelocity = getParticleBaseVelocity;
    function collisionVelocity(v1, v2, m1, m2) {
        return Vector_1.Vector.create((v1.x * (m1 - m2)) / (m1 + m2) + (v2.x * 2 * m2) / (m1 + m2), v1.y);
    }
    exports.collisionVelocity = collisionVelocity;
    function calcEasing(value, type) {
        switch (type) {
            case Enums$3.EasingType.easeOutQuad:
                return 1 - (1 - value) ** 2;
            case Enums$3.EasingType.easeOutCubic:
                return 1 - (1 - value) ** 3;
            case Enums$3.EasingType.easeOutQuart:
                return 1 - (1 - value) ** 4;
            case Enums$3.EasingType.easeOutQuint:
                return 1 - (1 - value) ** 5;
            case Enums$3.EasingType.easeOutExpo:
                return value === 1 ? 1 : 1 - Math.pow(2, -10 * value);
            case Enums$3.EasingType.easeOutSine:
                return Math.sin((value * Math.PI) / 2);
            case Enums$3.EasingType.easeOutBack: {
                const c1 = 1.70158;
                const c3 = c1 + 1;
                return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2);
            }
            case Enums$3.EasingType.easeOutCirc:
                return Math.sqrt(1 - Math.pow(value - 1, 2));
            default:
                return value;
        }
    }
    exports.calcEasing = calcEasing;
    });

    unwrapExports(NumberUtils);
    NumberUtils.calcEasing;
    NumberUtils.collisionVelocity;
    NumberUtils.getParticleBaseVelocity;
    NumberUtils.getParticleDirectionAngle;
    NumberUtils.getDistance;
    NumberUtils.getDistances;
    NumberUtils.getValue;
    NumberUtils.setRangeValue;
    NumberUtils.getRangeMax;
    NumberUtils.getRangeMin;
    NumberUtils.getRangeValue;
    NumberUtils.randomInRange;
    NumberUtils.mix;
    NumberUtils.clamp;

    var Utils$3 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.rectBounce = exports.circleBounce = exports.circleBounceDataFromParticle = exports.divMode = exports.singleDivModeExecute = exports.divModeExecute = exports.isDivModeEnabled = exports.deepExtend = exports.calculateBounds = exports.areBoundsInside = exports.isPointInside = exports.itemFromArray = exports.arrayRandomIndex = exports.loadFont = exports.isInArray = exports.cancelAnimation = exports.animate = exports.isSsr = void 0;



    function rectSideBounce(pSide, pOtherSide, rectSide, rectOtherSide, velocity, factor) {
        const res = { bounced: false };
        if (pOtherSide.min >= rectOtherSide.min &&
            pOtherSide.min <= rectOtherSide.max &&
            pOtherSide.max >= rectOtherSide.min &&
            pOtherSide.max <= rectOtherSide.max) {
            if ((pSide.max >= rectSide.min && pSide.max <= (rectSide.max + rectSide.min) / 2 && velocity > 0) ||
                (pSide.min <= rectSide.max && pSide.min > (rectSide.max + rectSide.min) / 2 && velocity < 0)) {
                res.velocity = velocity * -factor;
                res.bounced = true;
            }
        }
        return res;
    }
    function checkSelector(element, selectors) {
        if (selectors instanceof Array) {
            for (const selector of selectors) {
                if (element.matches(selector)) {
                    return true;
                }
            }
            return false;
        }
        else {
            return element.matches(selectors);
        }
    }
    function isSsr() {
        return typeof window === "undefined" || !window || typeof window.document === "undefined" || !window.document;
    }
    exports.isSsr = isSsr;
    function animate() {
        return isSsr()
            ? (callback) => setTimeout(callback)
            : (callback) => (window.requestAnimationFrame ||
                window.webkitRequestAnimationFrame ||
                window.mozRequestAnimationFrame ||
                window.oRequestAnimationFrame ||
                window.msRequestAnimationFrame ||
                window.setTimeout)(callback);
    }
    exports.animate = animate;
    function cancelAnimation() {
        return isSsr()
            ? (handle) => clearTimeout(handle)
            : (handle) => (window.cancelAnimationFrame ||
                window.webkitCancelRequestAnimationFrame ||
                window.mozCancelRequestAnimationFrame ||
                window.oCancelRequestAnimationFrame ||
                window.msCancelRequestAnimationFrame ||
                window.clearTimeout)(handle);
    }
    exports.cancelAnimation = cancelAnimation;
    function isInArray(value, array) {
        return value === array || (array instanceof Array && array.indexOf(value) > -1);
    }
    exports.isInArray = isInArray;
    async function loadFont(character) {
        var _a, _b;
        try {
            await document.fonts.load(`${(_a = character.weight) !== null && _a !== void 0 ? _a : "400"} 36px '${(_b = character.font) !== null && _b !== void 0 ? _b : "Verdana"}'`);
        }
        catch (_c) {
        }
    }
    exports.loadFont = loadFont;
    function arrayRandomIndex(array) {
        return Math.floor(Math.random() * array.length);
    }
    exports.arrayRandomIndex = arrayRandomIndex;
    function itemFromArray(array, index, useIndex = true) {
        const fixedIndex = index !== undefined && useIndex ? index % array.length : arrayRandomIndex(array);
        return array[fixedIndex];
    }
    exports.itemFromArray = itemFromArray;
    function isPointInside(point, size, radius, direction) {
        return areBoundsInside(calculateBounds(point, radius !== null && radius !== void 0 ? radius : 0), size, direction);
    }
    exports.isPointInside = isPointInside;
    function areBoundsInside(bounds, size, direction) {
        let inside = true;
        if (!direction || direction === Enums$3.OutModeDirection.bottom) {
            inside = bounds.top < size.height;
        }
        if (inside && (!direction || direction === Enums$3.OutModeDirection.left)) {
            inside = bounds.right > 0;
        }
        if (inside && (!direction || direction === Enums$3.OutModeDirection.right)) {
            inside = bounds.left < size.width;
        }
        if (inside && (!direction || direction === Enums$3.OutModeDirection.top)) {
            inside = bounds.bottom > 0;
        }
        return inside;
    }
    exports.areBoundsInside = areBoundsInside;
    function calculateBounds(point, radius) {
        return {
            bottom: point.y + radius,
            left: point.x - radius,
            right: point.x + radius,
            top: point.y - radius,
        };
    }
    exports.calculateBounds = calculateBounds;
    function deepExtend(destination, ...sources) {
        for (const source of sources) {
            if (source === undefined || source === null) {
                continue;
            }
            if (typeof source !== "object") {
                destination = source;
                continue;
            }
            const sourceIsArray = Array.isArray(source);
            if (sourceIsArray && (typeof destination !== "object" || !destination || !Array.isArray(destination))) {
                destination = [];
            }
            else if (!sourceIsArray && (typeof destination !== "object" || !destination || Array.isArray(destination))) {
                destination = {};
            }
            for (const key in source) {
                if (key === "__proto__") {
                    continue;
                }
                const sourceDict = source;
                const value = sourceDict[key];
                const isObject = typeof value === "object";
                const destDict = destination;
                destDict[key] =
                    isObject && Array.isArray(value)
                        ? value.map((v) => deepExtend(destDict[key], v))
                        : deepExtend(destDict[key], value);
            }
        }
        return destination;
    }
    exports.deepExtend = deepExtend;
    function isDivModeEnabled(mode, divs) {
        return divs instanceof Array ? !!divs.find((t) => t.enable && isInArray(mode, t.mode)) : isInArray(mode, divs.mode);
    }
    exports.isDivModeEnabled = isDivModeEnabled;
    function divModeExecute(mode, divs, callback) {
        if (divs instanceof Array) {
            for (const div of divs) {
                const divMode = div.mode;
                const divEnabled = div.enable;
                if (divEnabled && isInArray(mode, divMode)) {
                    singleDivModeExecute(div, callback);
                }
            }
        }
        else {
            const divMode = divs.mode;
            const divEnabled = divs.enable;
            if (divEnabled && isInArray(mode, divMode)) {
                singleDivModeExecute(divs, callback);
            }
        }
    }
    exports.divModeExecute = divModeExecute;
    function singleDivModeExecute(div, callback) {
        const selectors = div.selectors;
        if (selectors instanceof Array) {
            for (const selector of selectors) {
                callback(selector, div);
            }
        }
        else {
            callback(selectors, div);
        }
    }
    exports.singleDivModeExecute = singleDivModeExecute;
    function divMode(divs, element) {
        if (!element || !divs) {
            return;
        }
        if (divs instanceof Array) {
            return divs.find((d) => checkSelector(element, d.selectors));
        }
        else if (checkSelector(element, divs.selectors)) {
            return divs;
        }
    }
    exports.divMode = divMode;
    function circleBounceDataFromParticle(p) {
        return {
            position: p.getPosition(),
            radius: p.getRadius(),
            mass: p.getMass(),
            velocity: p.velocity,
            factor: Vector_1.Vector.create((0, NumberUtils.getValue)(p.options.bounce.horizontal), (0, NumberUtils.getValue)(p.options.bounce.vertical)),
        };
    }
    exports.circleBounceDataFromParticle = circleBounceDataFromParticle;
    function circleBounce(p1, p2) {
        const { x: xVelocityDiff, y: yVelocityDiff } = p1.velocity.sub(p2.velocity);
        const [pos1, pos2] = [p1.position, p2.position];
        const { dx: xDist, dy: yDist } = (0, NumberUtils.getDistances)(pos2, pos1);
        if (xVelocityDiff * xDist + yVelocityDiff * yDist >= 0) {
            const angle = -Math.atan2(yDist, xDist);
            const m1 = p1.mass;
            const m2 = p2.mass;
            const u1 = p1.velocity.rotate(angle);
            const u2 = p2.velocity.rotate(angle);
            const v1 = (0, NumberUtils.collisionVelocity)(u1, u2, m1, m2);
            const v2 = (0, NumberUtils.collisionVelocity)(u2, u1, m1, m2);
            const vFinal1 = v1.rotate(-angle);
            const vFinal2 = v2.rotate(-angle);
            p1.velocity.x = vFinal1.x * p1.factor.x;
            p1.velocity.y = vFinal1.y * p1.factor.y;
            p2.velocity.x = vFinal2.x * p2.factor.x;
            p2.velocity.y = vFinal2.y * p2.factor.y;
        }
    }
    exports.circleBounce = circleBounce;
    function rectBounce(particle, divBounds) {
        const pPos = particle.getPosition();
        const size = particle.getRadius();
        const bounds = calculateBounds(pPos, size);
        const resH = rectSideBounce({
            min: bounds.left,
            max: bounds.right,
        }, {
            min: bounds.top,
            max: bounds.bottom,
        }, {
            min: divBounds.left,
            max: divBounds.right,
        }, {
            min: divBounds.top,
            max: divBounds.bottom,
        }, particle.velocity.x, (0, NumberUtils.getValue)(particle.options.bounce.horizontal));
        if (resH.bounced) {
            if (resH.velocity !== undefined) {
                particle.velocity.x = resH.velocity;
            }
            if (resH.position !== undefined) {
                particle.position.x = resH.position;
            }
        }
        const resV = rectSideBounce({
            min: bounds.top,
            max: bounds.bottom,
        }, {
            min: bounds.left,
            max: bounds.right,
        }, {
            min: divBounds.top,
            max: divBounds.bottom,
        }, {
            min: divBounds.left,
            max: divBounds.right,
        }, particle.velocity.y, (0, NumberUtils.getValue)(particle.options.bounce.vertical));
        if (resV.bounced) {
            if (resV.velocity !== undefined) {
                particle.velocity.y = resV.velocity;
            }
            if (resV.position !== undefined) {
                particle.position.y = resV.position;
            }
        }
    }
    exports.rectBounce = rectBounce;
    });

    unwrapExports(Utils$3);
    Utils$3.rectBounce;
    Utils$3.circleBounce;
    Utils$3.circleBounceDataFromParticle;
    Utils$3.divMode;
    Utils$3.singleDivModeExecute;
    Utils$3.divModeExecute;
    Utils$3.isDivModeEnabled;
    Utils$3.deepExtend;
    Utils$3.calculateBounds;
    Utils$3.areBoundsInside;
    Utils$3.isPointInside;
    Utils$3.itemFromArray;
    Utils$3.arrayRandomIndex;
    Utils$3.loadFont;
    Utils$3.isInArray;
    Utils$3.cancelAnimation;
    Utils$3.animate;
    Utils$3.isSsr;

    var Constants_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Constants = void 0;
    class Constants {
    }
    exports.Constants = Constants;
    Constants.canvasClass = "tsparticles-canvas-el";
    Constants.randomColorValue = "random";
    Constants.midColorValue = "mid";
    Constants.touchEndEvent = "touchend";
    Constants.mouseDownEvent = "mousedown";
    Constants.mouseUpEvent = "mouseup";
    Constants.mouseMoveEvent = "mousemove";
    Constants.touchStartEvent = "touchstart";
    Constants.touchMoveEvent = "touchmove";
    Constants.mouseLeaveEvent = "mouseleave";
    Constants.mouseOutEvent = "mouseout";
    Constants.touchCancelEvent = "touchcancel";
    Constants.resizeEvent = "resize";
    Constants.visibilityChangeEvent = "visibilitychange";
    Constants.noPolygonDataLoaded = "No polygon data loaded.";
    Constants.noPolygonFound = "No polygon found, you need to specify SVG url in config.";
    });

    unwrapExports(Constants_1);
    Constants_1.Constants;

    var ColorUtils = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getHslAnimationFromHsl = exports.getHslFromAnimation = exports.getLinkRandomColor = exports.getLinkColor = exports.colorMix = exports.getStyleFromHsv = exports.getStyleFromHsl = exports.getStyleFromRgb = exports.getRandomRgbColor = exports.rgbaToHsva = exports.rgbToHsv = exports.hsvaToRgba = exports.hsvToRgb = exports.hsvaToHsla = exports.hsvToHsl = exports.hslaToHsva = exports.hslToHsv = exports.hslaToRgba = exports.hslToRgb = exports.stringToRgb = exports.stringToAlpha = exports.rgbToHsl = exports.colorToHsl = exports.colorToRgb = void 0;




    function hue2rgb(p, q, t) {
        let tCalc = t;
        if (tCalc < 0) {
            tCalc += 1;
        }
        if (tCalc > 1) {
            tCalc -= 1;
        }
        if (tCalc < 1 / 6) {
            return p + (q - p) * 6 * tCalc;
        }
        if (tCalc < 1 / 2) {
            return q;
        }
        if (tCalc < 2 / 3) {
            return p + (q - p) * (2 / 3 - tCalc) * 6;
        }
        return p;
    }
    function stringToRgba(input) {
        if (input.startsWith("rgb")) {
            const regex = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(,\s*([\d.]+)\s*)?\)/i;
            const result = regex.exec(input);
            return result
                ? {
                    a: result.length > 4 ? parseFloat(result[5]) : 1,
                    b: parseInt(result[3], 10),
                    g: parseInt(result[2], 10),
                    r: parseInt(result[1], 10),
                }
                : undefined;
        }
        else if (input.startsWith("hsl")) {
            const regex = /hsla?\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*(,\s*([\d.]+)\s*)?\)/i;
            const result = regex.exec(input);
            return result
                ? hslaToRgba({
                    a: result.length > 4 ? parseFloat(result[5]) : 1,
                    h: parseInt(result[1], 10),
                    l: parseInt(result[3], 10),
                    s: parseInt(result[2], 10),
                })
                : undefined;
        }
        else if (input.startsWith("hsv")) {
            const regex = /hsva?\(\s*(\d+)°\s*,\s*(\d+)%\s*,\s*(\d+)%\s*(,\s*([\d.]+)\s*)?\)/i;
            const result = regex.exec(input);
            return result
                ? hsvaToRgba({
                    a: result.length > 4 ? parseFloat(result[5]) : 1,
                    h: parseInt(result[1], 10),
                    s: parseInt(result[2], 10),
                    v: parseInt(result[3], 10),
                })
                : undefined;
        }
        else {
            const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])([a-f\d])?$/i;
            const hexFixed = input.replace(shorthandRegex, (_m, r, g, b, a) => {
                return r + r + g + g + b + b + (a !== undefined ? a + a : "");
            });
            const regex = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i;
            const result = regex.exec(hexFixed);
            return result
                ? {
                    a: result[4] !== undefined ? parseInt(result[4], 16) / 0xff : 1,
                    b: parseInt(result[3], 16),
                    g: parseInt(result[2], 16),
                    r: parseInt(result[1], 16),
                }
                : undefined;
        }
    }
    function colorToRgb(input, index, useIndex = true) {
        var _a, _b, _c;
        if (input === undefined) {
            return;
        }
        const color = typeof input === "string" ? { value: input } : input;
        let res;
        if (typeof color.value === "string") {
            if (color.value === Constants_1.Constants.randomColorValue) {
                res = getRandomRgbColor();
            }
            else {
                res = stringToRgb(color.value);
            }
        }
        else {
            if (color.value instanceof Array) {
                const colorSelected = (0, Utils$3.itemFromArray)(color.value, index, useIndex);
                res = colorToRgb({ value: colorSelected });
            }
            else {
                const colorValue = color.value;
                const rgbColor = (_a = colorValue.rgb) !== null && _a !== void 0 ? _a : color.value;
                if (rgbColor.r !== undefined) {
                    res = rgbColor;
                }
                else {
                    const hslColor = (_b = colorValue.hsl) !== null && _b !== void 0 ? _b : color.value;
                    if (hslColor.h !== undefined && hslColor.l !== undefined) {
                        res = hslToRgb(hslColor);
                    }
                    else {
                        const hsvColor = (_c = colorValue.hsv) !== null && _c !== void 0 ? _c : color.value;
                        if (hsvColor.h !== undefined && hsvColor.v !== undefined) {
                            res = hsvToRgb(hsvColor);
                        }
                    }
                }
            }
        }
        return res;
    }
    exports.colorToRgb = colorToRgb;
    function colorToHsl(color, index, useIndex = true) {
        const rgb = colorToRgb(color, index, useIndex);
        return rgb !== undefined ? rgbToHsl(rgb) : undefined;
    }
    exports.colorToHsl = colorToHsl;
    function rgbToHsl(color) {
        const r1 = color.r / 255;
        const g1 = color.g / 255;
        const b1 = color.b / 255;
        const max = Math.max(r1, g1, b1);
        const min = Math.min(r1, g1, b1);
        const res = {
            h: 0,
            l: (max + min) / 2,
            s: 0,
        };
        if (max != min) {
            res.s = res.l < 0.5 ? (max - min) / (max + min) : (max - min) / (2.0 - max - min);
            res.h =
                r1 === max
                    ? (g1 - b1) / (max - min)
                    : (res.h = g1 === max ? 2.0 + (b1 - r1) / (max - min) : 4.0 + (r1 - g1) / (max - min));
        }
        res.l *= 100;
        res.s *= 100;
        res.h *= 60;
        if (res.h < 0) {
            res.h += 360;
        }
        return res;
    }
    exports.rgbToHsl = rgbToHsl;
    function stringToAlpha(input) {
        var _a;
        return (_a = stringToRgba(input)) === null || _a === void 0 ? void 0 : _a.a;
    }
    exports.stringToAlpha = stringToAlpha;
    function stringToRgb(input) {
        return stringToRgba(input);
    }
    exports.stringToRgb = stringToRgb;
    function hslToRgb(hsl) {
        const result = { b: 0, g: 0, r: 0 };
        const hslPercent = {
            h: hsl.h / 360,
            l: hsl.l / 100,
            s: hsl.s / 100,
        };
        if (hslPercent.s === 0) {
            result.b = hslPercent.l;
            result.g = hslPercent.l;
            result.r = hslPercent.l;
        }
        else {
            const q = hslPercent.l < 0.5
                ? hslPercent.l * (1 + hslPercent.s)
                : hslPercent.l + hslPercent.s - hslPercent.l * hslPercent.s;
            const p = 2 * hslPercent.l - q;
            result.r = hue2rgb(p, q, hslPercent.h + 1 / 3);
            result.g = hue2rgb(p, q, hslPercent.h);
            result.b = hue2rgb(p, q, hslPercent.h - 1 / 3);
        }
        result.r = Math.floor(result.r * 255);
        result.g = Math.floor(result.g * 255);
        result.b = Math.floor(result.b * 255);
        return result;
    }
    exports.hslToRgb = hslToRgb;
    function hslaToRgba(hsla) {
        const rgbResult = hslToRgb(hsla);
        return {
            a: hsla.a,
            b: rgbResult.b,
            g: rgbResult.g,
            r: rgbResult.r,
        };
    }
    exports.hslaToRgba = hslaToRgba;
    function hslToHsv(hsl) {
        const l = hsl.l / 100, sl = hsl.s / 100;
        const v = l + sl * Math.min(l, 1 - l), sv = !v ? 0 : 2 * (1 - l / v);
        return {
            h: hsl.h,
            s: sv * 100,
            v: v * 100,
        };
    }
    exports.hslToHsv = hslToHsv;
    function hslaToHsva(hsla) {
        const hsvResult = hslToHsv(hsla);
        return {
            a: hsla.a,
            h: hsvResult.h,
            s: hsvResult.s,
            v: hsvResult.v,
        };
    }
    exports.hslaToHsva = hslaToHsva;
    function hsvToHsl(hsv) {
        const v = hsv.v / 100, sv = hsv.s / 100;
        const l = v * (1 - sv / 2), sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
        return {
            h: hsv.h,
            l: l * 100,
            s: sl * 100,
        };
    }
    exports.hsvToHsl = hsvToHsl;
    function hsvaToHsla(hsva) {
        const hslResult = hsvToHsl(hsva);
        return {
            a: hsva.a,
            h: hslResult.h,
            l: hslResult.l,
            s: hslResult.s,
        };
    }
    exports.hsvaToHsla = hsvaToHsla;
    function hsvToRgb(hsv) {
        const result = { b: 0, g: 0, r: 0 };
        const hsvPercent = {
            h: hsv.h / 60,
            s: hsv.s / 100,
            v: hsv.v / 100,
        };
        const c = hsvPercent.v * hsvPercent.s, x = c * (1 - Math.abs((hsvPercent.h % 2) - 1));
        let tempRgb;
        if (hsvPercent.h >= 0 && hsvPercent.h <= 1) {
            tempRgb = {
                r: c,
                g: x,
                b: 0,
            };
        }
        else if (hsvPercent.h > 1 && hsvPercent.h <= 2) {
            tempRgb = {
                r: x,
                g: c,
                b: 0,
            };
        }
        else if (hsvPercent.h > 2 && hsvPercent.h <= 3) {
            tempRgb = {
                r: 0,
                g: c,
                b: x,
            };
        }
        else if (hsvPercent.h > 3 && hsvPercent.h <= 4) {
            tempRgb = {
                r: 0,
                g: x,
                b: c,
            };
        }
        else if (hsvPercent.h > 4 && hsvPercent.h <= 5) {
            tempRgb = {
                r: x,
                g: 0,
                b: c,
            };
        }
        else if (hsvPercent.h > 5 && hsvPercent.h <= 6) {
            tempRgb = {
                r: c,
                g: 0,
                b: x,
            };
        }
        if (tempRgb) {
            const m = hsvPercent.v - c;
            result.r = Math.floor((tempRgb.r + m) * 255);
            result.g = Math.floor((tempRgb.g + m) * 255);
            result.b = Math.floor((tempRgb.b + m) * 255);
        }
        return result;
    }
    exports.hsvToRgb = hsvToRgb;
    function hsvaToRgba(hsva) {
        const rgbResult = hsvToRgb(hsva);
        return {
            a: hsva.a,
            b: rgbResult.b,
            g: rgbResult.g,
            r: rgbResult.r,
        };
    }
    exports.hsvaToRgba = hsvaToRgba;
    function rgbToHsv(rgb) {
        const rgbPercent = {
            r: rgb.r / 255,
            g: rgb.g / 255,
            b: rgb.b / 255,
        }, xMax = Math.max(rgbPercent.r, rgbPercent.g, rgbPercent.b), xMin = Math.min(rgbPercent.r, rgbPercent.g, rgbPercent.b), v = xMax, c = xMax - xMin;
        let h = 0;
        if (v === rgbPercent.r) {
            h = 60 * ((rgbPercent.g - rgbPercent.b) / c);
        }
        else if (v === rgbPercent.g) {
            h = 60 * (2 + (rgbPercent.b - rgbPercent.r) / c);
        }
        else if (v === rgbPercent.b) {
            h = 60 * (4 + (rgbPercent.r - rgbPercent.g) / c);
        }
        const s = !v ? 0 : c / v;
        return {
            h,
            s: s * 100,
            v: v * 100,
        };
    }
    exports.rgbToHsv = rgbToHsv;
    function rgbaToHsva(rgba) {
        const hsvResult = rgbToHsv(rgba);
        return {
            a: rgba.a,
            h: hsvResult.h,
            s: hsvResult.s,
            v: hsvResult.v,
        };
    }
    exports.rgbaToHsva = rgbaToHsva;
    function getRandomRgbColor(min) {
        const fixedMin = min !== null && min !== void 0 ? min : 0;
        return {
            b: Math.floor((0, NumberUtils.randomInRange)((0, NumberUtils.setRangeValue)(fixedMin, 256))),
            g: Math.floor((0, NumberUtils.randomInRange)((0, NumberUtils.setRangeValue)(fixedMin, 256))),
            r: Math.floor((0, NumberUtils.randomInRange)((0, NumberUtils.setRangeValue)(fixedMin, 256))),
        };
    }
    exports.getRandomRgbColor = getRandomRgbColor;
    function getStyleFromRgb(color, opacity) {
        return `rgba(${color.r}, ${color.g}, ${color.b}, ${opacity !== null && opacity !== void 0 ? opacity : 1})`;
    }
    exports.getStyleFromRgb = getStyleFromRgb;
    function getStyleFromHsl(color, opacity) {
        return `hsla(${color.h}, ${color.s}%, ${color.l}%, ${opacity !== null && opacity !== void 0 ? opacity : 1})`;
    }
    exports.getStyleFromHsl = getStyleFromHsl;
    function getStyleFromHsv(color, opacity) {
        return getStyleFromHsl(hsvToHsl(color), opacity);
    }
    exports.getStyleFromHsv = getStyleFromHsv;
    function colorMix(color1, color2, size1, size2) {
        let rgb1 = color1;
        let rgb2 = color2;
        if (rgb1.r === undefined) {
            rgb1 = hslToRgb(color1);
        }
        if (rgb2.r === undefined) {
            rgb2 = hslToRgb(color2);
        }
        return {
            b: (0, NumberUtils.mix)(rgb1.b, rgb2.b, size1, size2),
            g: (0, NumberUtils.mix)(rgb1.g, rgb2.g, size1, size2),
            r: (0, NumberUtils.mix)(rgb1.r, rgb2.r, size1, size2),
        };
    }
    exports.colorMix = colorMix;
    function getLinkColor(p1, p2, linkColor) {
        var _a, _b;
        if (linkColor === Constants_1.Constants.randomColorValue) {
            return getRandomRgbColor();
        }
        else if (linkColor === "mid") {
            const sourceColor = (_a = p1.getFillColor()) !== null && _a !== void 0 ? _a : p1.getStrokeColor();
            const destColor = (_b = p2 === null || p2 === void 0 ? void 0 : p2.getFillColor()) !== null && _b !== void 0 ? _b : p2 === null || p2 === void 0 ? void 0 : p2.getStrokeColor();
            if (sourceColor && destColor && p2) {
                return colorMix(sourceColor, destColor, p1.getRadius(), p2.getRadius());
            }
            else {
                const hslColor = sourceColor !== null && sourceColor !== void 0 ? sourceColor : destColor;
                if (hslColor) {
                    return hslToRgb(hslColor);
                }
            }
        }
        else {
            return linkColor;
        }
    }
    exports.getLinkColor = getLinkColor;
    function getLinkRandomColor(optColor, blink, consent) {
        const color = typeof optColor === "string" ? optColor : optColor.value;
        if (color === Constants_1.Constants.randomColorValue) {
            if (consent) {
                return colorToRgb({
                    value: color,
                });
            }
            else if (blink) {
                return Constants_1.Constants.randomColorValue;
            }
            else {
                return Constants_1.Constants.midColorValue;
            }
        }
        else {
            return colorToRgb({
                value: color,
            });
        }
    }
    exports.getLinkRandomColor = getLinkRandomColor;
    function getHslFromAnimation(animation) {
        return animation !== undefined
            ? {
                h: animation.h.value,
                s: animation.s.value,
                l: animation.l.value,
            }
            : undefined;
    }
    exports.getHslFromAnimation = getHslFromAnimation;
    function getHslAnimationFromHsl(hsl, animationOptions, reduceFactor) {
        const resColor = {
            h: {
                enable: false,
                value: hsl.h,
            },
            s: {
                enable: false,
                value: hsl.s,
            },
            l: {
                enable: false,
                value: hsl.l,
            },
        };
        if (animationOptions) {
            setColorAnimation(resColor.h, animationOptions.h, reduceFactor);
            setColorAnimation(resColor.s, animationOptions.s, reduceFactor);
            setColorAnimation(resColor.l, animationOptions.l, reduceFactor);
        }
        return resColor;
    }
    exports.getHslAnimationFromHsl = getHslAnimationFromHsl;
    function setColorAnimation(colorValue, colorAnimation, reduceFactor) {
        colorValue.enable = colorAnimation.enable;
        if (colorValue.enable) {
            colorValue.velocity = (colorAnimation.speed / 100) * reduceFactor;
            if (colorAnimation.sync) {
                return;
            }
            colorValue.status = Enums$3.AnimationStatus.increasing;
            colorValue.velocity *= Math.random();
            if (colorValue.value) {
                colorValue.value *= Math.random();
            }
        }
        else {
            colorValue.velocity = 0;
        }
    }
    });

    unwrapExports(ColorUtils);
    ColorUtils.getHslAnimationFromHsl;
    ColorUtils.getHslFromAnimation;
    ColorUtils.getLinkRandomColor;
    ColorUtils.getLinkColor;
    ColorUtils.colorMix;
    ColorUtils.getStyleFromHsv;
    ColorUtils.getStyleFromHsl;
    ColorUtils.getStyleFromRgb;
    ColorUtils.getRandomRgbColor;
    ColorUtils.rgbaToHsva;
    ColorUtils.rgbToHsv;
    ColorUtils.hsvaToRgba;
    ColorUtils.hsvToRgb;
    ColorUtils.hsvaToHsla;
    ColorUtils.hsvToHsl;
    ColorUtils.hslaToHsva;
    ColorUtils.hslToHsv;
    ColorUtils.hslaToRgba;
    ColorUtils.hslToRgb;
    ColorUtils.stringToRgb;
    ColorUtils.stringToAlpha;
    ColorUtils.rgbToHsl;
    ColorUtils.colorToHsl;
    ColorUtils.colorToRgb;

    var CanvasUtils = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.alterHsl = exports.drawEllipse = exports.drawParticlePlugin = exports.drawPlugin = exports.drawShapeAfterEffect = exports.drawShape = exports.drawParticle = exports.drawGrabLine = exports.gradient = exports.drawConnectLine = exports.drawLinkTriangle = exports.drawLinkLine = exports.clear = exports.paintBase = void 0;



    function drawLine(context, begin, end) {
        context.beginPath();
        context.moveTo(begin.x, begin.y);
        context.lineTo(end.x, end.y);
        context.closePath();
    }
    function drawTriangle(context, p1, p2, p3) {
        context.beginPath();
        context.moveTo(p1.x, p1.y);
        context.lineTo(p2.x, p2.y);
        context.lineTo(p3.x, p3.y);
        context.closePath();
    }
    function paintBase(context, dimension, baseColor) {
        context.save();
        context.fillStyle = baseColor !== null && baseColor !== void 0 ? baseColor : "rgba(0,0,0,0)";
        context.fillRect(0, 0, dimension.width, dimension.height);
        context.restore();
    }
    exports.paintBase = paintBase;
    function clear(context, dimension) {
        context.clearRect(0, 0, dimension.width, dimension.height);
    }
    exports.clear = clear;
    function drawLinkLine(context, width, begin, end, maxDistance, canvasSize, warp, backgroundMask, composite, colorLine, opacity, shadow) {
        let drawn = false;
        if ((0, NumberUtils.getDistance)(begin, end) <= maxDistance) {
            drawLine(context, begin, end);
            drawn = true;
        }
        else if (warp) {
            let pi1;
            let pi2;
            const endNE = {
                x: end.x - canvasSize.width,
                y: end.y,
            };
            const d1 = (0, NumberUtils.getDistances)(begin, endNE);
            if (d1.distance <= maxDistance) {
                const yi = begin.y - (d1.dy / d1.dx) * begin.x;
                pi1 = { x: 0, y: yi };
                pi2 = { x: canvasSize.width, y: yi };
            }
            else {
                const endSW = {
                    x: end.x,
                    y: end.y - canvasSize.height,
                };
                const d2 = (0, NumberUtils.getDistances)(begin, endSW);
                if (d2.distance <= maxDistance) {
                    const yi = begin.y - (d2.dy / d2.dx) * begin.x;
                    const xi = -yi / (d2.dy / d2.dx);
                    pi1 = { x: xi, y: 0 };
                    pi2 = { x: xi, y: canvasSize.height };
                }
                else {
                    const endSE = {
                        x: end.x - canvasSize.width,
                        y: end.y - canvasSize.height,
                    };
                    const d3 = (0, NumberUtils.getDistances)(begin, endSE);
                    if (d3.distance <= maxDistance) {
                        const yi = begin.y - (d3.dy / d3.dx) * begin.x;
                        const xi = -yi / (d3.dy / d3.dx);
                        pi1 = { x: xi, y: yi };
                        pi2 = { x: pi1.x + canvasSize.width, y: pi1.y + canvasSize.height };
                    }
                }
            }
            if (pi1 && pi2) {
                drawLine(context, begin, pi1);
                drawLine(context, end, pi2);
                drawn = true;
            }
        }
        if (!drawn) {
            return;
        }
        context.lineWidth = width;
        if (backgroundMask) {
            context.globalCompositeOperation = composite;
        }
        context.strokeStyle = (0, ColorUtils.getStyleFromRgb)(colorLine, opacity);
        if (shadow.enable) {
            const shadowColor = (0, ColorUtils.colorToRgb)(shadow.color);
            if (shadowColor) {
                context.shadowBlur = shadow.blur;
                context.shadowColor = (0, ColorUtils.getStyleFromRgb)(shadowColor);
            }
        }
        context.stroke();
    }
    exports.drawLinkLine = drawLinkLine;
    function drawLinkTriangle(context, pos1, pos2, pos3, backgroundMask, composite, colorTriangle, opacityTriangle) {
        drawTriangle(context, pos1, pos2, pos3);
        if (backgroundMask) {
            context.globalCompositeOperation = composite;
        }
        context.fillStyle = (0, ColorUtils.getStyleFromRgb)(colorTriangle, opacityTriangle);
        context.fill();
    }
    exports.drawLinkTriangle = drawLinkTriangle;
    function drawConnectLine(context, width, lineStyle, begin, end) {
        context.save();
        drawLine(context, begin, end);
        context.lineWidth = width;
        context.strokeStyle = lineStyle;
        context.stroke();
        context.restore();
    }
    exports.drawConnectLine = drawConnectLine;
    function gradient(context, p1, p2, opacity) {
        const gradStop = Math.floor(p2.getRadius() / p1.getRadius());
        const color1 = p1.getFillColor();
        const color2 = p2.getFillColor();
        if (!color1 || !color2) {
            return;
        }
        const sourcePos = p1.getPosition();
        const destPos = p2.getPosition();
        const midRgb = (0, ColorUtils.colorMix)(color1, color2, p1.getRadius(), p2.getRadius());
        const grad = context.createLinearGradient(sourcePos.x, sourcePos.y, destPos.x, destPos.y);
        grad.addColorStop(0, (0, ColorUtils.getStyleFromHsl)(color1, opacity));
        grad.addColorStop(gradStop > 1 ? 1 : gradStop, (0, ColorUtils.getStyleFromRgb)(midRgb, opacity));
        grad.addColorStop(1, (0, ColorUtils.getStyleFromHsl)(color2, opacity));
        return grad;
    }
    exports.gradient = gradient;
    function drawGrabLine(context, width, begin, end, colorLine, opacity) {
        context.save();
        drawLine(context, begin, end);
        context.strokeStyle = (0, ColorUtils.getStyleFromRgb)(colorLine, opacity);
        context.lineWidth = width;
        context.stroke();
        context.restore();
    }
    exports.drawGrabLine = drawGrabLine;
    function drawParticle(container, context, particle, delta, fillColorValue, strokeColorValue, backgroundMask, composite, radius, opacity, shadow, gradient) {
        var _a, _b, _c, _d, _e, _f;
        const pos = particle.getPosition();
        const tiltOptions = particle.options.tilt;
        const rollOptions = particle.options.roll;
        context.save();
        if (tiltOptions.enable || rollOptions.enable) {
            const roll = rollOptions.enable && particle.roll;
            const tilt = tiltOptions.enable && particle.tilt;
            const rollHorizontal = roll && (rollOptions.mode === Enums$3.RollMode.horizontal || rollOptions.mode === Enums$3.RollMode.both);
            const rollVertical = roll && (rollOptions.mode === Enums$3.RollMode.vertical || rollOptions.mode === Enums$3.RollMode.both);
            context.setTransform(rollHorizontal ? Math.cos(particle.roll.angle) : 1, tilt ? Math.cos(particle.tilt.value) * particle.tilt.cosDirection : 0, tilt ? Math.sin(particle.tilt.value) * particle.tilt.sinDirection : 0, rollVertical ? Math.sin(particle.roll.angle) : 1, pos.x, pos.y);
        }
        else {
            context.translate(pos.x, pos.y);
        }
        context.beginPath();
        const angle = ((_b = (_a = particle.rotate) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : 0) + (particle.options.rotate.path ? particle.velocity.angle : 0);
        if (angle !== 0) {
            context.rotate(angle);
        }
        if (backgroundMask) {
            context.globalCompositeOperation = composite;
        }
        const shadowColor = particle.shadowColor;
        if (shadow.enable && shadowColor) {
            context.shadowBlur = shadow.blur;
            context.shadowColor = (0, ColorUtils.getStyleFromRgb)(shadowColor);
            context.shadowOffsetX = shadow.offset.x;
            context.shadowOffsetY = shadow.offset.y;
        }
        if (gradient) {
            const gradientAngle = gradient.angle.value;
            const fillGradient = gradient.type === Enums$3.GradientType.radial
                ? context.createRadialGradient(0, 0, 0, 0, 0, radius)
                : context.createLinearGradient(Math.cos(gradientAngle) * -radius, Math.sin(gradientAngle) * -radius, Math.cos(gradientAngle) * radius, Math.sin(gradientAngle) * radius);
            for (const color of gradient.colors) {
                fillGradient.addColorStop(color.stop, (0, ColorUtils.getStyleFromHsl)({
                    h: color.value.h.value,
                    s: color.value.s.value,
                    l: color.value.l.value,
                }, (_d = (_c = color.opacity) === null || _c === void 0 ? void 0 : _c.value) !== null && _d !== void 0 ? _d : opacity));
            }
            context.fillStyle = fillGradient;
        }
        else {
            if (fillColorValue) {
                context.fillStyle = fillColorValue;
            }
        }
        const stroke = particle.stroke;
        context.lineWidth = (_e = particle.strokeWidth) !== null && _e !== void 0 ? _e : 0;
        if (strokeColorValue) {
            context.strokeStyle = strokeColorValue;
        }
        drawShape(container, context, particle, radius, opacity, delta);
        if (((_f = stroke === null || stroke === void 0 ? void 0 : stroke.width) !== null && _f !== void 0 ? _f : 0) > 0) {
            context.stroke();
        }
        if (particle.close) {
            context.closePath();
        }
        if (particle.fill) {
            context.fill();
        }
        context.restore();
        context.save();
        if (tiltOptions.enable && particle.tilt) {
            context.setTransform(1, Math.cos(particle.tilt.value) * particle.tilt.cosDirection, Math.sin(particle.tilt.value) * particle.tilt.sinDirection, 1, pos.x, pos.y);
        }
        else {
            context.translate(pos.x, pos.y);
        }
        if (angle !== 0) {
            context.rotate(angle);
        }
        if (backgroundMask) {
            context.globalCompositeOperation = composite;
        }
        drawShapeAfterEffect(container, context, particle, radius, opacity, delta);
        context.restore();
    }
    exports.drawParticle = drawParticle;
    function drawShape(container, context, particle, radius, opacity, delta) {
        if (!particle.shape) {
            return;
        }
        const drawer = container.drawers.get(particle.shape);
        if (!drawer) {
            return;
        }
        drawer.draw(context, particle, radius, opacity, delta, container.retina.pixelRatio);
    }
    exports.drawShape = drawShape;
    function drawShapeAfterEffect(container, context, particle, radius, opacity, delta) {
        if (!particle.shape) {
            return;
        }
        const drawer = container.drawers.get(particle.shape);
        if (!(drawer === null || drawer === void 0 ? void 0 : drawer.afterEffect)) {
            return;
        }
        drawer.afterEffect(context, particle, radius, opacity, delta, container.retina.pixelRatio);
    }
    exports.drawShapeAfterEffect = drawShapeAfterEffect;
    function drawPlugin(context, plugin, delta) {
        if (!plugin.draw) {
            return;
        }
        context.save();
        plugin.draw(context, delta);
        context.restore();
    }
    exports.drawPlugin = drawPlugin;
    function drawParticlePlugin(context, plugin, particle, delta) {
        if (plugin.drawParticle !== undefined) {
            context.save();
            plugin.drawParticle(context, particle, delta);
            context.restore();
        }
    }
    exports.drawParticlePlugin = drawParticlePlugin;
    function drawEllipse(context, particle, fillColorValue, radius, opacity, width, rotation, start, end) {
        const pos = particle.getPosition();
        if (fillColorValue) {
            context.strokeStyle = (0, ColorUtils.getStyleFromHsl)(fillColorValue, opacity);
        }
        if (width === 0) {
            return;
        }
        context.lineWidth = width;
        const rotationRadian = (rotation * Math.PI) / 180;
        context.beginPath();
        context.ellipse(pos.x, pos.y, radius / 2, radius * 2, rotationRadian, start, end);
        context.stroke();
    }
    exports.drawEllipse = drawEllipse;
    function alterHsl(color, type, value) {
        return {
            h: color.h,
            s: color.s,
            l: color.l + (type === Enums$3.AlterType.darken ? -1 : 1) * value,
        };
    }
    exports.alterHsl = alterHsl;
    });

    unwrapExports(CanvasUtils);
    CanvasUtils.alterHsl;
    CanvasUtils.drawEllipse;
    CanvasUtils.drawParticlePlugin;
    CanvasUtils.drawPlugin;
    CanvasUtils.drawShapeAfterEffect;
    CanvasUtils.drawShape;
    CanvasUtils.drawParticle;
    CanvasUtils.drawGrabLine;
    CanvasUtils.gradient;
    CanvasUtils.drawConnectLine;
    CanvasUtils.drawLinkTriangle;
    CanvasUtils.drawLinkLine;
    CanvasUtils.clear;
    CanvasUtils.paintBase;

    var Range_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Range = void 0;
    class Range {
        constructor(x, y) {
            this.position = {
                x: x,
                y: y,
            };
        }
    }
    exports.Range = Range;
    });

    unwrapExports(Range_1);
    Range_1.Range;

    var Circle_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Circle = void 0;


    class Circle extends Range_1.Range {
        constructor(x, y, radius) {
            super(x, y);
            this.radius = radius;
        }
        contains(point) {
            return (0, NumberUtils.getDistance)(point, this.position) <= this.radius;
        }
        intersects(range) {
            const rect = range;
            const circle = range;
            const pos1 = this.position;
            const pos2 = range.position;
            const xDist = Math.abs(pos2.x - pos1.x);
            const yDist = Math.abs(pos2.y - pos1.y);
            const r = this.radius;
            if (circle.radius !== undefined) {
                const rSum = r + circle.radius;
                const dist = Math.sqrt(xDist * xDist + yDist + yDist);
                return rSum > dist;
            }
            else if (rect.size !== undefined) {
                const w = rect.size.width;
                const h = rect.size.height;
                const edges = Math.pow(xDist - w, 2) + Math.pow(yDist - h, 2);
                if (xDist > r + w || yDist > r + h) {
                    return false;
                }
                if (xDist <= w || yDist <= h) {
                    return true;
                }
                return edges <= r * r;
            }
            return false;
        }
    }
    exports.Circle = Circle;
    });

    unwrapExports(Circle_1);
    Circle_1.Circle;

    var Rectangle_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Rectangle = void 0;

    class Rectangle extends Range_1.Range {
        constructor(x, y, width, height) {
            super(x, y);
            this.size = {
                height: height,
                width: width,
            };
        }
        contains(point) {
            const w = this.size.width;
            const h = this.size.height;
            const pos = this.position;
            return point.x >= pos.x && point.x <= pos.x + w && point.y >= pos.y && point.y <= pos.y + h;
        }
        intersects(range) {
            const rect = range;
            const circle = range;
            const w = this.size.width;
            const h = this.size.height;
            const pos1 = this.position;
            const pos2 = range.position;
            if (circle.radius !== undefined) {
                return circle.intersects(this);
            }
            else if (rect.size !== undefined) {
                const size2 = rect.size;
                const w2 = size2.width;
                const h2 = size2.height;
                return pos2.x < pos1.x + w && pos2.x + w2 > pos1.x && pos2.y < pos1.y + h && pos2.y + h2 > pos1.y;
            }
            return false;
        }
    }
    exports.Rectangle = Rectangle;
    });

    unwrapExports(Rectangle_1);
    Rectangle_1.Rectangle;

    var CircleWarp_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CircleWarp = void 0;


    class CircleWarp extends Circle_1.Circle {
        constructor(x, y, radius, canvasSize) {
            super(x, y, radius);
            this.canvasSize = canvasSize;
            this.canvasSize = {
                height: canvasSize.height,
                width: canvasSize.width,
            };
        }
        contains(point) {
            if (super.contains(point)) {
                return true;
            }
            const posNE = {
                x: point.x - this.canvasSize.width,
                y: point.y,
            };
            if (super.contains(posNE)) {
                return true;
            }
            const posSE = {
                x: point.x - this.canvasSize.width,
                y: point.y - this.canvasSize.height,
            };
            if (super.contains(posSE)) {
                return true;
            }
            const posSW = {
                x: point.x,
                y: point.y - this.canvasSize.height,
            };
            return super.contains(posSW);
        }
        intersects(range) {
            if (super.intersects(range)) {
                return true;
            }
            const rect = range;
            const circle = range;
            const newPos = {
                x: range.position.x - this.canvasSize.width,
                y: range.position.y - this.canvasSize.height,
            };
            if (circle.radius !== undefined) {
                const biggerCircle = new Circle_1.Circle(newPos.x, newPos.y, circle.radius * 2);
                return super.intersects(biggerCircle);
            }
            else if (rect.size !== undefined) {
                const rectSW = new Rectangle_1.Rectangle(newPos.x, newPos.y, rect.size.width * 2, rect.size.height * 2);
                return super.intersects(rectSW);
            }
            return false;
        }
    }
    exports.CircleWarp = CircleWarp;
    });

    unwrapExports(CircleWarp_1);
    CircleWarp_1.CircleWarp;

    var EventListeners_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.EventListeners = void 0;



    function manageListener(element, event, handler, add, options) {
        if (add) {
            let addOptions = { passive: true };
            if (typeof options === "boolean") {
                addOptions.capture = options;
            }
            else if (options !== undefined) {
                addOptions = options;
            }
            element.addEventListener(event, handler, addOptions);
        }
        else {
            const removeOptions = options;
            element.removeEventListener(event, handler, removeOptions);
        }
    }
    class EventListeners {
        constructor(container) {
            this.container = container;
            this.canPush = true;
            this.mouseMoveHandler = (e) => this.mouseTouchMove(e);
            this.touchStartHandler = (e) => this.mouseTouchMove(e);
            this.touchMoveHandler = (e) => this.mouseTouchMove(e);
            this.touchEndHandler = () => this.mouseTouchFinish();
            this.mouseLeaveHandler = () => this.mouseTouchFinish();
            this.touchCancelHandler = () => this.mouseTouchFinish();
            this.touchEndClickHandler = (e) => this.mouseTouchClick(e);
            this.mouseUpHandler = (e) => this.mouseTouchClick(e);
            this.mouseDownHandler = () => this.mouseDown();
            this.visibilityChangeHandler = () => this.handleVisibilityChange();
            this.themeChangeHandler = (e) => this.handleThemeChange(e);
            this.oldThemeChangeHandler = (e) => this.handleThemeChange(e);
            this.resizeHandler = () => this.handleWindowResize();
        }
        addListeners() {
            this.manageListeners(true);
        }
        removeListeners() {
            this.manageListeners(false);
        }
        manageListeners(add) {
            var _a;
            const container = this.container;
            const options = container.actualOptions;
            const detectType = options.interactivity.detectsOn;
            let mouseLeaveEvent = Constants_1.Constants.mouseLeaveEvent;
            if (detectType === Enums$3.InteractivityDetect.window) {
                container.interactivity.element = window;
                mouseLeaveEvent = Constants_1.Constants.mouseOutEvent;
            }
            else if (detectType === Enums$3.InteractivityDetect.parent && container.canvas.element) {
                const canvasEl = container.canvas.element;
                container.interactivity.element = (_a = canvasEl.parentElement) !== null && _a !== void 0 ? _a : canvasEl.parentNode;
            }
            else {
                container.interactivity.element = container.canvas.element;
            }
            const mediaMatch = !(0, Utils$3.isSsr)() && typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)");
            if (mediaMatch) {
                if (mediaMatch.addEventListener !== undefined) {
                    manageListener(mediaMatch, "change", this.themeChangeHandler, add);
                }
                else if (mediaMatch.addListener !== undefined) {
                    if (add) {
                        mediaMatch.addListener(this.oldThemeChangeHandler);
                    }
                    else {
                        mediaMatch.removeListener(this.oldThemeChangeHandler);
                    }
                }
            }
            const interactivityEl = container.interactivity.element;
            if (!interactivityEl) {
                return;
            }
            const html = interactivityEl;
            if (options.interactivity.events.onHover.enable || options.interactivity.events.onClick.enable) {
                manageListener(interactivityEl, Constants_1.Constants.mouseMoveEvent, this.mouseMoveHandler, add);
                manageListener(interactivityEl, Constants_1.Constants.touchStartEvent, this.touchStartHandler, add);
                manageListener(interactivityEl, Constants_1.Constants.touchMoveEvent, this.touchMoveHandler, add);
                if (!options.interactivity.events.onClick.enable) {
                    manageListener(interactivityEl, Constants_1.Constants.touchEndEvent, this.touchEndHandler, add);
                }
                else {
                    manageListener(interactivityEl, Constants_1.Constants.touchEndEvent, this.touchEndClickHandler, add);
                    manageListener(interactivityEl, Constants_1.Constants.mouseUpEvent, this.mouseUpHandler, add);
                    manageListener(interactivityEl, Constants_1.Constants.mouseDownEvent, this.mouseDownHandler, add);
                }
                manageListener(interactivityEl, mouseLeaveEvent, this.mouseLeaveHandler, add);
                manageListener(interactivityEl, Constants_1.Constants.touchCancelEvent, this.touchCancelHandler, add);
            }
            if (container.canvas.element) {
                container.canvas.element.style.pointerEvents = html === container.canvas.element ? "initial" : "none";
            }
            if (options.interactivity.events.resize) {
                if (typeof ResizeObserver !== "undefined") {
                    if (this.resizeObserver && !add) {
                        if (container.canvas.element) {
                            this.resizeObserver.unobserve(container.canvas.element);
                        }
                        this.resizeObserver.disconnect();
                        delete this.resizeObserver;
                    }
                    else if (!this.resizeObserver && add && container.canvas.element) {
                        this.resizeObserver = new ResizeObserver((entries) => {
                            const entry = entries.find((e) => e.target === container.canvas.element);
                            if (!entry) {
                                return;
                            }
                            this.handleWindowResize();
                        });
                        this.resizeObserver.observe(container.canvas.element);
                    }
                }
                else {
                    manageListener(window, Constants_1.Constants.resizeEvent, this.resizeHandler, add);
                }
            }
            if (document) {
                manageListener(document, Constants_1.Constants.visibilityChangeEvent, this.visibilityChangeHandler, add, false);
            }
        }
        handleWindowResize() {
            if (this.resizeTimeout) {
                clearTimeout(this.resizeTimeout);
                delete this.resizeTimeout;
            }
            this.resizeTimeout = setTimeout(() => { var _a; return (_a = this.container.canvas) === null || _a === void 0 ? void 0 : _a.windowResize(); }, 500);
        }
        handleVisibilityChange() {
            const container = this.container;
            const options = container.actualOptions;
            this.mouseTouchFinish();
            if (!options.pauseOnBlur) {
                return;
            }
            if (document === null || document === void 0 ? void 0 : document.hidden) {
                container.pageHidden = true;
                container.pause();
            }
            else {
                container.pageHidden = false;
                if (container.getAnimationStatus()) {
                    container.play(true);
                }
                else {
                    container.draw(true);
                }
            }
        }
        mouseDown() {
            const interactivity = this.container.interactivity;
            if (interactivity) {
                const mouse = interactivity.mouse;
                mouse.clicking = true;
                mouse.downPosition = mouse.position;
            }
        }
        mouseTouchMove(e) {
            var _a, _b, _c, _d, _e, _f, _g;
            const container = this.container;
            const options = container.actualOptions;
            if (((_a = container.interactivity) === null || _a === void 0 ? void 0 : _a.element) === undefined) {
                return;
            }
            container.interactivity.mouse.inside = true;
            let pos;
            const canvas = container.canvas.element;
            if (e.type.startsWith("mouse")) {
                this.canPush = true;
                const mouseEvent = e;
                if (container.interactivity.element === window) {
                    if (canvas) {
                        const clientRect = canvas.getBoundingClientRect();
                        pos = {
                            x: mouseEvent.clientX - clientRect.left,
                            y: mouseEvent.clientY - clientRect.top,
                        };
                    }
                }
                else if (options.interactivity.detectsOn === Enums$3.InteractivityDetect.parent) {
                    const source = mouseEvent.target;
                    const target = mouseEvent.currentTarget;
                    const canvasEl = container.canvas.element;
                    if (source && target && canvasEl) {
                        const sourceRect = source.getBoundingClientRect();
                        const targetRect = target.getBoundingClientRect();
                        const canvasRect = canvasEl.getBoundingClientRect();
                        pos = {
                            x: mouseEvent.offsetX + 2 * sourceRect.left - (targetRect.left + canvasRect.left),
                            y: mouseEvent.offsetY + 2 * sourceRect.top - (targetRect.top + canvasRect.top),
                        };
                    }
                    else {
                        pos = {
                            x: (_b = mouseEvent.offsetX) !== null && _b !== void 0 ? _b : mouseEvent.clientX,
                            y: (_c = mouseEvent.offsetY) !== null && _c !== void 0 ? _c : mouseEvent.clientY,
                        };
                    }
                }
                else {
                    if (mouseEvent.target === container.canvas.element) {
                        pos = {
                            x: (_d = mouseEvent.offsetX) !== null && _d !== void 0 ? _d : mouseEvent.clientX,
                            y: (_e = mouseEvent.offsetY) !== null && _e !== void 0 ? _e : mouseEvent.clientY,
                        };
                    }
                }
            }
            else {
                this.canPush = e.type !== "touchmove";
                const touchEvent = e;
                const lastTouch = touchEvent.touches[touchEvent.touches.length - 1];
                const canvasRect = canvas === null || canvas === void 0 ? void 0 : canvas.getBoundingClientRect();
                pos = {
                    x: lastTouch.clientX - ((_f = canvasRect === null || canvasRect === void 0 ? void 0 : canvasRect.left) !== null && _f !== void 0 ? _f : 0),
                    y: lastTouch.clientY - ((_g = canvasRect === null || canvasRect === void 0 ? void 0 : canvasRect.top) !== null && _g !== void 0 ? _g : 0),
                };
            }
            const pxRatio = container.retina.pixelRatio;
            if (pos) {
                pos.x *= pxRatio;
                pos.y *= pxRatio;
            }
            container.interactivity.mouse.position = pos;
            container.interactivity.status = Constants_1.Constants.mouseMoveEvent;
        }
        mouseTouchFinish() {
            const interactivity = this.container.interactivity;
            if (interactivity === undefined) {
                return;
            }
            const mouse = interactivity.mouse;
            delete mouse.position;
            delete mouse.clickPosition;
            delete mouse.downPosition;
            interactivity.status = Constants_1.Constants.mouseLeaveEvent;
            mouse.inside = false;
            mouse.clicking = false;
        }
        mouseTouchClick(e) {
            const container = this.container;
            const options = container.actualOptions;
            const mouse = container.interactivity.mouse;
            mouse.inside = true;
            let handled = false;
            const mousePosition = mouse.position;
            if (mousePosition === undefined || !options.interactivity.events.onClick.enable) {
                return;
            }
            for (const [, plugin] of container.plugins) {
                if (plugin.clickPositionValid !== undefined) {
                    handled = plugin.clickPositionValid(mousePosition);
                    if (handled) {
                        break;
                    }
                }
            }
            if (!handled) {
                this.doMouseTouchClick(e);
            }
            mouse.clicking = false;
        }
        doMouseTouchClick(e) {
            const container = this.container;
            const options = container.actualOptions;
            if (this.canPush) {
                const mousePos = container.interactivity.mouse.position;
                if (mousePos) {
                    container.interactivity.mouse.clickPosition = {
                        x: mousePos.x,
                        y: mousePos.y,
                    };
                }
                else {
                    return;
                }
                container.interactivity.mouse.clickTime = new Date().getTime();
                const onClick = options.interactivity.events.onClick;
                if (onClick.mode instanceof Array) {
                    for (const mode of onClick.mode) {
                        this.handleClickMode(mode);
                    }
                }
                else {
                    this.handleClickMode(onClick.mode);
                }
            }
            if (e.type === "touchend") {
                setTimeout(() => this.mouseTouchFinish(), 500);
            }
        }
        handleThemeChange(e) {
            const mediaEvent = e;
            const themeName = mediaEvent.matches
                ? this.container.options.defaultDarkTheme
                : this.container.options.defaultLightTheme;
            const theme = this.container.options.themes.find((theme) => theme.name === themeName);
            if (theme && theme.default.auto) {
                this.container.loadTheme(themeName);
            }
        }
        handleClickMode(mode) {
            const container = this.container;
            const options = container.actualOptions;
            const pushNb = options.interactivity.modes.push.quantity;
            const removeNb = options.interactivity.modes.remove.quantity;
            switch (mode) {
                case Enums$3.ClickMode.push: {
                    if (pushNb > 0) {
                        const pushOptions = options.interactivity.modes.push;
                        const group = (0, Utils$3.itemFromArray)([undefined, ...pushOptions.groups]);
                        const groupOptions = group !== undefined ? container.actualOptions.particles.groups[group] : undefined;
                        container.particles.push(pushNb, container.interactivity.mouse, groupOptions, group);
                    }
                    break;
                }
                case Enums$3.ClickMode.remove:
                    container.particles.removeQuantity(removeNb);
                    break;
                case Enums$3.ClickMode.bubble:
                    container.bubble.clicking = true;
                    break;
                case Enums$3.ClickMode.repulse:
                    container.repulse.clicking = true;
                    container.repulse.count = 0;
                    for (const particle of container.repulse.particles) {
                        particle.velocity.setTo(particle.initialVelocity);
                    }
                    container.repulse.particles = [];
                    container.repulse.finish = false;
                    setTimeout(() => {
                        if (!container.destroyed) {
                            container.repulse.clicking = false;
                        }
                    }, options.interactivity.modes.repulse.duration * 1000);
                    break;
                case Enums$3.ClickMode.attract:
                    container.attract.clicking = true;
                    container.attract.count = 0;
                    for (const particle of container.attract.particles) {
                        particle.velocity.setTo(particle.initialVelocity);
                    }
                    container.attract.particles = [];
                    container.attract.finish = false;
                    setTimeout(() => {
                        if (!container.destroyed) {
                            container.attract.clicking = false;
                        }
                    }, options.interactivity.modes.attract.duration * 1000);
                    break;
                case Enums$3.ClickMode.pause:
                    if (container.getAnimationStatus()) {
                        container.pause();
                    }
                    else {
                        container.play();
                    }
                    break;
            }
            for (const [, plugin] of container.plugins) {
                if (plugin.handleClickMode) {
                    plugin.handleClickMode(mode);
                }
            }
        }
    }
    exports.EventListeners = EventListeners;
    });

    unwrapExports(EventListeners_1);
    EventListeners_1.EventListeners;

    var Plugins_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Plugins = void 0;
    const plugins = [];
    const interactorsInitializers = new Map();
    const updatersInitializers = new Map();
    const interactors = new Map();
    const updaters = new Map();
    const presets = new Map();
    const drawers = new Map();
    const pathGenerators = new Map();
    class Plugins {
        static getPlugin(plugin) {
            return plugins.find((t) => t.id === plugin);
        }
        static addPlugin(plugin) {
            if (!Plugins.getPlugin(plugin.id)) {
                plugins.push(plugin);
            }
        }
        static getAvailablePlugins(container) {
            const res = new Map();
            for (const plugin of plugins) {
                if (!plugin.needsPlugin(container.actualOptions)) {
                    continue;
                }
                res.set(plugin.id, plugin.getPlugin(container));
            }
            return res;
        }
        static loadOptions(options, sourceOptions) {
            for (const plugin of plugins) {
                plugin.loadOptions(options, sourceOptions);
            }
        }
        static getPreset(preset) {
            return presets.get(preset);
        }
        static addPreset(presetKey, options, override = false) {
            if (override || !Plugins.getPreset(presetKey)) {
                presets.set(presetKey, options);
            }
        }
        static addShapeDrawer(type, drawer) {
            if (!Plugins.getShapeDrawer(type)) {
                drawers.set(type, drawer);
            }
        }
        static getShapeDrawer(type) {
            return drawers.get(type);
        }
        static getSupportedShapes() {
            return drawers.keys();
        }
        static getPathGenerator(type) {
            return pathGenerators.get(type);
        }
        static addPathGenerator(type, pathGenerator) {
            if (!Plugins.getPathGenerator(type)) {
                pathGenerators.set(type, pathGenerator);
            }
        }
        static getInteractors(container, force = false) {
            let res = interactors.get(container);
            if (!res || force) {
                res = [...interactorsInitializers.values()].map((t) => t(container));
                interactors.set(container, res);
            }
            return res;
        }
        static addInteractor(name, initInteractor) {
            interactorsInitializers.set(name, initInteractor);
        }
        static getUpdaters(container, force = false) {
            let res = updaters.get(container);
            if (!res || force) {
                res = [...updatersInitializers.values()].map((t) => t(container));
                updaters.set(container, res);
            }
            return res;
        }
        static addParticleUpdater(name, initUpdater) {
            updatersInitializers.set(name, initUpdater);
        }
    }
    exports.Plugins = Plugins;
    });

    unwrapExports(Plugins_1);
    Plugins_1.Plugins;

    var Point_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Point = void 0;
    class Point {
        constructor(position, particle) {
            this.position = position;
            this.particle = particle;
        }
    }
    exports.Point = Point;
    });

    unwrapExports(Point_1);
    Point_1.Point;

    var QuadTree_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.QuadTree = void 0;




    class QuadTree {
        constructor(rectangle, capacity) {
            this.rectangle = rectangle;
            this.capacity = capacity;
            this.points = [];
            this.divided = false;
        }
        subdivide() {
            const x = this.rectangle.position.x;
            const y = this.rectangle.position.y;
            const w = this.rectangle.size.width;
            const h = this.rectangle.size.height;
            const capacity = this.capacity;
            this.northEast = new QuadTree(new Rectangle_1.Rectangle(x, y, w / 2, h / 2), capacity);
            this.northWest = new QuadTree(new Rectangle_1.Rectangle(x + w / 2, y, w / 2, h / 2), capacity);
            this.southEast = new QuadTree(new Rectangle_1.Rectangle(x, y + h / 2, w / 2, h / 2), capacity);
            this.southWest = new QuadTree(new Rectangle_1.Rectangle(x + w / 2, y + h / 2, w / 2, h / 2), capacity);
            this.divided = true;
        }
        insert(point) {
            var _a, _b, _c, _d, _e;
            if (!this.rectangle.contains(point.position)) {
                return false;
            }
            if (this.points.length < this.capacity) {
                this.points.push(point);
                return true;
            }
            if (!this.divided) {
                this.subdivide();
            }
            return ((_e = (((_a = this.northEast) === null || _a === void 0 ? void 0 : _a.insert(point)) ||
                ((_b = this.northWest) === null || _b === void 0 ? void 0 : _b.insert(point)) ||
                ((_c = this.southEast) === null || _c === void 0 ? void 0 : _c.insert(point)) ||
                ((_d = this.southWest) === null || _d === void 0 ? void 0 : _d.insert(point)))) !== null && _e !== void 0 ? _e : false);
        }
        queryCircle(position, radius) {
            return this.query(new Circle_1.Circle(position.x, position.y, radius));
        }
        queryCircleWarp(position, radius, containerOrSize) {
            const container = containerOrSize;
            const size = containerOrSize;
            return this.query(new CircleWarp_1.CircleWarp(position.x, position.y, radius, container.canvas !== undefined ? container.canvas.size : size));
        }
        queryRectangle(position, size) {
            return this.query(new Rectangle_1.Rectangle(position.x, position.y, size.width, size.height));
        }
        query(range, found) {
            var _a, _b, _c, _d;
            const res = found !== null && found !== void 0 ? found : [];
            if (!range.intersects(this.rectangle)) {
                return [];
            }
            else {
                for (const p of this.points) {
                    if (!range.contains(p.position) && (0, NumberUtils.getDistance)(range.position, p.position) > p.particle.getRadius()) {
                        continue;
                    }
                    res.push(p.particle);
                }
                if (this.divided) {
                    (_a = this.northEast) === null || _a === void 0 ? void 0 : _a.query(range, res);
                    (_b = this.northWest) === null || _b === void 0 ? void 0 : _b.query(range, res);
                    (_c = this.southEast) === null || _c === void 0 ? void 0 : _c.query(range, res);
                    (_d = this.southWest) === null || _d === void 0 ? void 0 : _d.query(range, res);
                }
            }
            return res;
        }
    }
    exports.QuadTree = QuadTree;
    });

    unwrapExports(QuadTree_1);
    QuadTree_1.QuadTree;

    var Utils$2 = createCommonjsModule(function (module, exports) {
    var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
    }) : (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
    }));
    var __exportStar = (commonjsGlobal && commonjsGlobal.__exportStar) || function(m, exports) {
        for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    __exportStar(CanvasUtils, exports);
    __exportStar(Circle_1, exports);
    __exportStar(CircleWarp_1, exports);
    __exportStar(ColorUtils, exports);
    __exportStar(Constants_1, exports);
    __exportStar(EventListeners_1, exports);
    __exportStar(NumberUtils, exports);
    __exportStar(Plugins_1, exports);
    __exportStar(Point_1, exports);
    __exportStar(QuadTree_1, exports);
    __exportStar(Range_1, exports);
    __exportStar(Rectangle_1, exports);
    __exportStar(Utils$3, exports);
    });

    unwrapExports(Utils$2);

    var Canvas_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Canvas = void 0;

    const Utils_2 = Utils$2;
    class Canvas {
        constructor(container) {
            this.container = container;
            this.size = {
                height: 0,
                width: 0,
            };
            this.context = null;
            this.generatedCanvas = false;
        }
        init() {
            this.resize();
            this.initStyle();
            this.initCover();
            this.initTrail();
            this.initBackground();
            this.paint();
        }
        loadCanvas(canvas, generatedCanvas) {
            var _a;
            if (!canvas.className) {
                canvas.className = Utils$2.Constants.canvasClass;
            }
            if (this.generatedCanvas) {
                (_a = this.element) === null || _a === void 0 ? void 0 : _a.remove();
            }
            this.generatedCanvas = generatedCanvas !== null && generatedCanvas !== void 0 ? generatedCanvas : this.generatedCanvas;
            this.element = canvas;
            this.originalStyle = (0, Utils$2.deepExtend)({}, this.element.style);
            this.size.height = canvas.offsetHeight;
            this.size.width = canvas.offsetWidth;
            this.context = this.element.getContext("2d");
            this.container.retina.init();
            this.initBackground();
        }
        destroy() {
            var _a;
            if (this.generatedCanvas) {
                (_a = this.element) === null || _a === void 0 ? void 0 : _a.remove();
            }
            this.draw((ctx) => {
                (0, Utils_2.clear)(ctx, this.size);
            });
        }
        paint() {
            const options = this.container.actualOptions;
            this.draw((ctx) => {
                if (options.backgroundMask.enable && options.backgroundMask.cover && this.coverColor) {
                    (0, Utils_2.clear)(ctx, this.size);
                    this.paintBase((0, Utils$2.getStyleFromRgb)(this.coverColor, this.coverColor.a));
                }
                else {
                    this.paintBase();
                }
            });
        }
        clear() {
            const options = this.container.actualOptions;
            const trail = options.particles.move.trail;
            if (options.backgroundMask.enable) {
                this.paint();
            }
            else if (trail.enable && trail.length > 0 && this.trailFillColor) {
                this.paintBase((0, Utils$2.getStyleFromRgb)(this.trailFillColor, 1 / trail.length));
            }
            else {
                this.draw((ctx) => {
                    (0, Utils_2.clear)(ctx, this.size);
                });
            }
        }
        windowResize() {
            if (!this.element) {
                return;
            }
            const container = this.container;
            this.resize();
            const needsRefresh = container.updateActualOptions();
            container.particles.setDensity();
            for (const [, plugin] of container.plugins) {
                if (plugin.resize !== undefined) {
                    plugin.resize();
                }
            }
            if (needsRefresh) {
                container.refresh();
            }
        }
        resize() {
            if (!this.element) {
                return;
            }
            const container = this.container;
            const pxRatio = container.retina.pixelRatio;
            const size = container.canvas.size;
            const oldSize = {
                width: size.width,
                height: size.height,
            };
            size.width = this.element.offsetWidth * pxRatio;
            size.height = this.element.offsetHeight * pxRatio;
            this.element.width = size.width;
            this.element.height = size.height;
            if (this.container.started) {
                this.resizeFactor = {
                    width: size.width / oldSize.width,
                    height: size.height / oldSize.height,
                };
            }
        }
        drawConnectLine(p1, p2) {
            this.draw((ctx) => {
                var _a;
                const lineStyle = this.lineStyle(p1, p2);
                if (!lineStyle) {
                    return;
                }
                const pos1 = p1.getPosition();
                const pos2 = p2.getPosition();
                (0, Utils$2.drawConnectLine)(ctx, (_a = p1.retina.linksWidth) !== null && _a !== void 0 ? _a : this.container.retina.linksWidth, lineStyle, pos1, pos2);
            });
        }
        drawGrabLine(particle, lineColor, opacity, mousePos) {
            const container = this.container;
            this.draw((ctx) => {
                var _a;
                const beginPos = particle.getPosition();
                (0, Utils$2.drawGrabLine)(ctx, (_a = particle.retina.linksWidth) !== null && _a !== void 0 ? _a : container.retina.linksWidth, beginPos, mousePos, lineColor, opacity);
            });
        }
        drawParticle(particle, delta) {
            var _a, _b, _c, _d, _e, _f;
            if (particle.spawning || particle.destroyed) {
                return;
            }
            const pfColor = particle.getFillColor();
            const psColor = (_a = particle.getStrokeColor()) !== null && _a !== void 0 ? _a : pfColor;
            if (!pfColor && !psColor) {
                return;
            }
            let [fColor, sColor] = this.getPluginParticleColors(particle);
            const pOptions = particle.options;
            const twinkle = pOptions.twinkle.particles;
            const twinkling = twinkle.enable && Math.random() < twinkle.frequency;
            if (!fColor || !sColor) {
                const twinkleRgb = (0, Utils$2.colorToHsl)(twinkle.color);
                if (!fColor) {
                    fColor = twinkling && twinkleRgb !== undefined ? twinkleRgb : pfColor ? pfColor : undefined;
                }
                if (!sColor) {
                    sColor = twinkling && twinkleRgb !== undefined ? twinkleRgb : psColor ? psColor : undefined;
                }
            }
            const options = this.container.actualOptions;
            const zIndexOptions = particle.options.zIndex;
            const zOpacityFactor = (1 - particle.zIndexFactor) ** zIndexOptions.opacityRate;
            const radius = particle.getRadius();
            const opacity = twinkling ? twinkle.opacity : (_d = (_b = particle.bubble.opacity) !== null && _b !== void 0 ? _b : (_c = particle.opacity) === null || _c === void 0 ? void 0 : _c.value) !== null && _d !== void 0 ? _d : 1;
            const strokeOpacity = (_f = (_e = particle.stroke) === null || _e === void 0 ? void 0 : _e.opacity) !== null && _f !== void 0 ? _f : opacity;
            const zOpacity = opacity * zOpacityFactor;
            const fillColorValue = fColor ? (0, Utils$2.getStyleFromHsl)(fColor, zOpacity) : undefined;
            if (!fillColorValue && !sColor) {
                return;
            }
            this.draw((ctx) => {
                const zSizeFactor = (1 - particle.zIndexFactor) ** zIndexOptions.sizeRate;
                const zStrokeOpacity = strokeOpacity * zOpacityFactor;
                const strokeColorValue = sColor ? (0, Utils$2.getStyleFromHsl)(sColor, zStrokeOpacity) : fillColorValue;
                if (radius <= 0) {
                    return;
                }
                const container = this.container;
                for (const updater of container.particles.updaters) {
                    if (updater.beforeDraw) {
                        updater.beforeDraw(particle);
                    }
                }
                (0, Utils$2.drawParticle)(this.container, ctx, particle, delta, fillColorValue, strokeColorValue, options.backgroundMask.enable, options.backgroundMask.composite, radius * zSizeFactor, zOpacity, particle.options.shadow, particle.gradient);
                for (const updater of container.particles.updaters) {
                    if (updater.afterDraw) {
                        updater.afterDraw(particle);
                    }
                }
            });
        }
        drawPlugin(plugin, delta) {
            this.draw((ctx) => {
                (0, Utils$2.drawPlugin)(ctx, plugin, delta);
            });
        }
        drawParticlePlugin(plugin, particle, delta) {
            this.draw((ctx) => {
                (0, Utils$2.drawParticlePlugin)(ctx, plugin, particle, delta);
            });
        }
        initBackground() {
            const options = this.container.actualOptions;
            const background = options.background;
            const element = this.element;
            const elementStyle = element === null || element === void 0 ? void 0 : element.style;
            if (!elementStyle) {
                return;
            }
            if (background.color) {
                const color = (0, Utils$2.colorToRgb)(background.color);
                elementStyle.backgroundColor = color ? (0, Utils$2.getStyleFromRgb)(color, background.opacity) : "";
            }
            else {
                elementStyle.backgroundColor = "";
            }
            elementStyle.backgroundImage = background.image || "";
            elementStyle.backgroundPosition = background.position || "";
            elementStyle.backgroundRepeat = background.repeat || "";
            elementStyle.backgroundSize = background.size || "";
        }
        draw(cb) {
            if (!this.context) {
                return;
            }
            return cb(this.context);
        }
        initCover() {
            const options = this.container.actualOptions;
            const cover = options.backgroundMask.cover;
            const color = cover.color;
            const coverRgb = (0, Utils$2.colorToRgb)(color);
            if (coverRgb) {
                this.coverColor = {
                    r: coverRgb.r,
                    g: coverRgb.g,
                    b: coverRgb.b,
                    a: cover.opacity,
                };
            }
        }
        initTrail() {
            const options = this.container.actualOptions;
            const trail = options.particles.move.trail;
            const fillColor = (0, Utils$2.colorToRgb)(trail.fillColor);
            if (fillColor) {
                const trail = options.particles.move.trail;
                this.trailFillColor = {
                    r: fillColor.r,
                    g: fillColor.g,
                    b: fillColor.b,
                    a: 1 / trail.length,
                };
            }
        }
        getPluginParticleColors(particle) {
            let fColor;
            let sColor;
            for (const [, plugin] of this.container.plugins) {
                if (!fColor && plugin.particleFillColor) {
                    fColor = (0, Utils$2.colorToHsl)(plugin.particleFillColor(particle));
                }
                if (!sColor && plugin.particleStrokeColor) {
                    sColor = (0, Utils$2.colorToHsl)(plugin.particleStrokeColor(particle));
                }
                if (fColor && sColor) {
                    break;
                }
            }
            return [fColor, sColor];
        }
        initStyle() {
            const element = this.element, options = this.container.actualOptions;
            if (!element) {
                return;
            }
            const originalStyle = this.originalStyle;
            if (options.fullScreen.enable) {
                this.originalStyle = (0, Utils$2.deepExtend)({}, element.style);
                element.style.position = "fixed";
                element.style.zIndex = options.fullScreen.zIndex.toString(10);
                element.style.top = "0";
                element.style.left = "0";
                element.style.width = "100%";
                element.style.height = "100%";
            }
            else if (originalStyle) {
                element.style.position = originalStyle.position;
                element.style.zIndex = originalStyle.zIndex;
                element.style.top = originalStyle.top;
                element.style.left = originalStyle.left;
                element.style.width = originalStyle.width;
                element.style.height = originalStyle.height;
            }
        }
        paintBase(baseColor) {
            this.draw((ctx) => {
                (0, Utils$2.paintBase)(ctx, this.size, baseColor);
            });
        }
        lineStyle(p1, p2) {
            return this.draw((ctx) => {
                const options = this.container.actualOptions;
                const connectOptions = options.interactivity.modes.connect;
                return (0, Utils$2.gradient)(ctx, p1, p2, connectOptions.links.opacity);
            });
        }
    }
    exports.Canvas = Canvas;
    });

    unwrapExports(Canvas_1);
    Canvas_1.Canvas;

    var OptionsColor_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.OptionsColor = void 0;
    class OptionsColor {
        constructor() {
            this.value = "#fff";
        }
        static create(source, data) {
            const color = new OptionsColor();
            color.load(source);
            if (data !== undefined) {
                if (typeof data === "string" || data instanceof Array) {
                    color.load({ value: data });
                }
                else {
                    color.load(data);
                }
            }
            return color;
        }
        load(data) {
            if ((data === null || data === void 0 ? void 0 : data.value) === undefined) {
                return;
            }
            this.value = data.value;
        }
    }
    exports.OptionsColor = OptionsColor;
    });

    unwrapExports(OptionsColor_1);
    OptionsColor_1.OptionsColor;

    var LinksShadow_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.LinksShadow = void 0;

    class LinksShadow {
        constructor() {
            this.blur = 5;
            this.color = new OptionsColor_1.OptionsColor();
            this.enable = false;
            this.color.value = "#00ff00";
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.blur !== undefined) {
                this.blur = data.blur;
            }
            this.color = OptionsColor_1.OptionsColor.create(this.color, data.color);
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
        }
    }
    exports.LinksShadow = LinksShadow;
    });

    unwrapExports(LinksShadow_1);
    LinksShadow_1.LinksShadow;

    var LinksTriangle_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.LinksTriangle = void 0;

    class LinksTriangle {
        constructor() {
            this.enable = false;
            this.frequency = 1;
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.color !== undefined) {
                this.color = OptionsColor_1.OptionsColor.create(this.color, data.color);
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            if (data.frequency !== undefined) {
                this.frequency = data.frequency;
            }
            if (data.opacity !== undefined) {
                this.opacity = data.opacity;
            }
        }
    }
    exports.LinksTriangle = LinksTriangle;
    });

    unwrapExports(LinksTriangle_1);
    LinksTriangle_1.LinksTriangle;

    var Links_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Links = void 0;



    class Links {
        constructor() {
            this.blink = false;
            this.color = new OptionsColor_1.OptionsColor();
            this.consent = false;
            this.distance = 100;
            this.enable = false;
            this.frequency = 1;
            this.opacity = 1;
            this.shadow = new LinksShadow_1.LinksShadow();
            this.triangles = new LinksTriangle_1.LinksTriangle();
            this.width = 1;
            this.warp = false;
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.id !== undefined) {
                this.id = data.id;
            }
            if (data.blink !== undefined) {
                this.blink = data.blink;
            }
            this.color = OptionsColor_1.OptionsColor.create(this.color, data.color);
            if (data.consent !== undefined) {
                this.consent = data.consent;
            }
            if (data.distance !== undefined) {
                this.distance = data.distance;
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            if (data.frequency !== undefined) {
                this.frequency = data.frequency;
            }
            if (data.opacity !== undefined) {
                this.opacity = data.opacity;
            }
            this.shadow.load(data.shadow);
            this.triangles.load(data.triangles);
            if (data.width !== undefined) {
                this.width = data.width;
            }
            if (data.warp !== undefined) {
                this.warp = data.warp;
            }
        }
    }
    exports.Links = Links;
    });

    unwrapExports(Links_1);
    Links_1.Links;

    var Attract_1$1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Attract = void 0;
    class Attract {
        constructor() {
            this.distance = 200;
            this.enable = false;
            this.rotate = {
                x: 3000,
                y: 3000,
            };
        }
        get rotateX() {
            return this.rotate.x;
        }
        set rotateX(value) {
            this.rotate.x = value;
        }
        get rotateY() {
            return this.rotate.y;
        }
        set rotateY(value) {
            this.rotate.y = value;
        }
        load(data) {
            var _a, _b, _c, _d;
            if (!data) {
                return;
            }
            if (data.distance !== undefined) {
                this.distance = data.distance;
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            const rotateX = (_b = (_a = data.rotate) === null || _a === void 0 ? void 0 : _a.x) !== null && _b !== void 0 ? _b : data.rotateX;
            if (rotateX !== undefined) {
                this.rotate.x = rotateX;
            }
            const rotateY = (_d = (_c = data.rotate) === null || _c === void 0 ? void 0 : _c.y) !== null && _d !== void 0 ? _d : data.rotateY;
            if (rotateY !== undefined) {
                this.rotate.y = rotateY;
            }
        }
    }
    exports.Attract = Attract;
    });

    unwrapExports(Attract_1$1);
    Attract_1$1.Attract;

    var Trail_1$1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Trail = void 0;

    class Trail {
        constructor() {
            this.enable = false;
            this.length = 10;
            this.fillColor = new OptionsColor_1.OptionsColor();
            this.fillColor.value = "#000000";
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            this.fillColor = OptionsColor_1.OptionsColor.create(this.fillColor, data.fillColor);
            if (data.length !== undefined) {
                this.length = data.length;
            }
        }
    }
    exports.Trail = Trail;
    });

    unwrapExports(Trail_1$1);
    Trail_1$1.Trail;

    var Random_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Random = void 0;
    class Random {
        constructor() {
            this.enable = false;
            this.minimumValue = 0;
        }
        load(data) {
            if (!data) {
                return;
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            if (data.minimumValue !== undefined) {
                this.minimumValue = data.minimumValue;
            }
        }
    }
    exports.Random = Random;
    });

    unwrapExports(Random_1);
    Random_1.Random;

    var ValueWithRandom_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ValueWithRandom = void 0;


    class ValueWithRandom {
        constructor() {
            this.random = new Random_1.Random();
            this.value = 0;
        }
        load(data) {
            if (!data) {
                return;
            }
            if (typeof data.random === "boolean") {
                this.random.enable = data.random;
            }
            else {
                this.random.load(data.random);
            }
            if (data.value !== undefined) {
                this.value = (0, Utils$2.setRangeValue)(data.value, this.random.enable ? this.random.minimumValue : undefined);
            }
        }
    }
    exports.ValueWithRandom = ValueWithRandom;
    });

    unwrapExports(ValueWithRandom_1);
    ValueWithRandom_1.ValueWithRandom;

    var PathDelay_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.PathDelay = void 0;

    class PathDelay extends ValueWithRandom_1.ValueWithRandom {
        constructor() {
            super();
        }
    }
    exports.PathDelay = PathDelay;
    });

    unwrapExports(PathDelay_1);
    PathDelay_1.PathDelay;

    var Path_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Path = void 0;


    class Path {
        constructor() {
            this.clamp = true;
            this.delay = new PathDelay_1.PathDelay();
            this.enable = false;
            this.options = {};
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.clamp !== undefined) {
                this.clamp = data.clamp;
            }
            this.delay.load(data.delay);
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            this.generator = data.generator;
            if (data.options) {
                this.options = (0, Utils$2.deepExtend)(this.options, data.options);
            }
        }
    }
    exports.Path = Path;
    });

    unwrapExports(Path_1);
    Path_1.Path;

    var MoveAngle_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MoveAngle = void 0;
    class MoveAngle {
        constructor() {
            this.offset = 0;
            this.value = 90;
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.offset !== undefined) {
                this.offset = data.offset;
            }
            if (data.value !== undefined) {
                this.value = data.value;
            }
        }
    }
    exports.MoveAngle = MoveAngle;
    });

    unwrapExports(MoveAngle_1);
    MoveAngle_1.MoveAngle;

    var MoveGravity_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MoveGravity = void 0;
    class MoveGravity {
        constructor() {
            this.acceleration = 9.81;
            this.enable = false;
            this.inverse = false;
            this.maxSpeed = 50;
        }
        load(data) {
            if (!data) {
                return;
            }
            if (data.acceleration !== undefined) {
                this.acceleration = data.acceleration;
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            if (data.inverse !== undefined) {
                this.inverse = data.inverse;
            }
            if (data.maxSpeed !== undefined) {
                this.maxSpeed = data.maxSpeed;
            }
        }
    }
    exports.MoveGravity = MoveGravity;
    });

    unwrapExports(MoveGravity_1);
    MoveGravity_1.MoveGravity;

    var OutModes_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.OutModes = void 0;

    class OutModes {
        constructor() {
            this.default = Modes.OutMode.out;
        }
        load(data) {
            var _a, _b, _c, _d;
            if (!data) {
                return;
            }
            if (data.default !== undefined) {
                this.default = data.default;
            }
            this.bottom = (_a = data.bottom) !== null && _a !== void 0 ? _a : data.default;
            this.left = (_b = data.left) !== null && _b !== void 0 ? _b : data.default;
            this.right = (_c = data.right) !== null && _c !== void 0 ? _c : data.default;
            this.top = (_d = data.top) !== null && _d !== void 0 ? _d : data.default;
        }
    }
    exports.OutModes = OutModes;
    });

    unwrapExports(OutModes_1);
    OutModes_1.OutModes;

    var Spin_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Spin = void 0;

    class Spin {
        constructor() {
            this.acceleration = 0;
            this.enable = false;
        }
        load(data) {
            if (!data) {
                return;
            }
            if (data.acceleration !== undefined) {
                this.acceleration = (0, Utils$2.setRangeValue)(data.acceleration);
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            this.position = data.position ? (0, Utils$2.deepExtend)({}, data.position) : undefined;
        }
    }
    exports.Spin = Spin;
    });

    unwrapExports(Spin_1);
    Spin_1.Spin;

    var Move_1$1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Move = void 0;









    class Move {
        constructor() {
            this.angle = new MoveAngle_1.MoveAngle();
            this.attract = new Attract_1$1.Attract();
            this.decay = 0;
            this.distance = {};
            this.direction = Enums$3.MoveDirection.none;
            this.drift = 0;
            this.enable = false;
            this.gravity = new MoveGravity_1.MoveGravity();
            this.path = new Path_1.Path();
            this.outModes = new OutModes_1.OutModes();
            this.random = false;
            this.size = false;
            this.speed = 2;
            this.spin = new Spin_1.Spin();
            this.straight = false;
            this.trail = new Trail_1$1.Trail();
            this.vibrate = false;
            this.warp = false;
        }
        get collisions() {
            return false;
        }
        set collisions(value) {
        }
        get bounce() {
            return this.collisions;
        }
        set bounce(value) {
            this.collisions = value;
        }
        get out_mode() {
            return this.outMode;
        }
        set out_mode(value) {
            this.outMode = value;
        }
        get outMode() {
            return this.outModes.default;
        }
        set outMode(value) {
            this.outModes.default = value;
        }
        get noise() {
            return this.path;
        }
        set noise(value) {
            this.path = value;
        }
        load(data) {
            var _a, _b, _c;
            if (data === undefined) {
                return;
            }
            if (data.angle !== undefined) {
                if (typeof data.angle === "number") {
                    this.angle.value = data.angle;
                }
                else {
                    this.angle.load(data.angle);
                }
            }
            this.attract.load(data.attract);
            if (data.decay !== undefined) {
                this.decay = data.decay;
            }
            if (data.direction !== undefined) {
                this.direction = data.direction;
            }
            if (data.distance !== undefined) {
                this.distance =
                    typeof data.distance === "number"
                        ? {
                            horizontal: data.distance,
                            vertical: data.distance,
                        }
                        : (0, Utils$2.deepExtend)({}, data.distance);
            }
            if (data.drift !== undefined) {
                this.drift = (0, Utils$2.setRangeValue)(data.drift);
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            this.gravity.load(data.gravity);
            const outMode = (_a = data.outMode) !== null && _a !== void 0 ? _a : data.out_mode;
            if (data.outModes !== undefined || outMode !== undefined) {
                if (typeof data.outModes === "string" || (data.outModes === undefined && outMode !== undefined)) {
                    this.outModes.load({
                        default: (_b = data.outModes) !== null && _b !== void 0 ? _b : outMode,
                    });
                }
                else {
                    this.outModes.load(data.outModes);
                }
            }
            this.path.load((_c = data.path) !== null && _c !== void 0 ? _c : data.noise);
            if (data.random !== undefined) {
                this.random = data.random;
            }
            if (data.size !== undefined) {
                this.size = data.size;
            }
            if (data.speed !== undefined) {
                this.speed = (0, Utils$2.setRangeValue)(data.speed);
            }
            this.spin.load(data.spin);
            if (data.straight !== undefined) {
                this.straight = data.straight;
            }
            this.trail.load(data.trail);
            if (data.vibrate !== undefined) {
                this.vibrate = data.vibrate;
            }
            if (data.warp !== undefined) {
                this.warp = data.warp;
            }
        }
    }
    exports.Move = Move;
    });

    unwrapExports(Move_1$1);
    Move_1$1.Move;

    var Density_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Density = void 0;
    class Density {
        constructor() {
            this.enable = false;
            this.area = 800;
            this.factor = 1000;
        }
        get value_area() {
            return this.area;
        }
        set value_area(value) {
            this.area = value;
        }
        load(data) {
            var _a;
            if (data === undefined) {
                return;
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            const area = (_a = data.area) !== null && _a !== void 0 ? _a : data.value_area;
            if (area !== undefined) {
                this.area = area;
            }
            if (data.factor !== undefined) {
                this.factor = data.factor;
            }
        }
    }
    exports.Density = Density;
    });

    unwrapExports(Density_1);
    Density_1.Density;

    var ParticlesNumber_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ParticlesNumber = void 0;

    class ParticlesNumber {
        constructor() {
            this.density = new Density_1.Density();
            this.limit = 0;
            this.value = 100;
        }
        get max() {
            return this.limit;
        }
        set max(value) {
            this.limit = value;
        }
        load(data) {
            var _a;
            if (data === undefined) {
                return;
            }
            this.density.load(data.density);
            const limit = (_a = data.limit) !== null && _a !== void 0 ? _a : data.max;
            if (limit !== undefined) {
                this.limit = limit;
            }
            if (data.value !== undefined) {
                this.value = data.value;
            }
        }
    }
    exports.ParticlesNumber = ParticlesNumber;
    });

    unwrapExports(ParticlesNumber_1);
    ParticlesNumber_1.ParticlesNumber;

    var AnimationOptions_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AnimationOptions = void 0;
    class AnimationOptions {
        constructor() {
            this.count = 0;
            this.enable = false;
            this.speed = 1;
            this.sync = false;
        }
        load(data) {
            if (!data) {
                return;
            }
            if (data.count !== undefined) {
                this.count = data.count;
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            if (data.speed !== undefined) {
                this.speed = data.speed;
            }
            if (data.sync !== undefined) {
                this.sync = data.sync;
            }
        }
    }
    exports.AnimationOptions = AnimationOptions;
    });

    unwrapExports(AnimationOptions_1);
    AnimationOptions_1.AnimationOptions;

    var OpacityAnimation_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.OpacityAnimation = void 0;


    class OpacityAnimation extends AnimationOptions_1.AnimationOptions {
        constructor() {
            super();
            this.destroy = Enums$3.DestroyType.none;
            this.enable = false;
            this.speed = 2;
            this.startValue = Enums$3.StartValueType.random;
            this.sync = false;
        }
        get opacity_min() {
            return this.minimumValue;
        }
        set opacity_min(value) {
            this.minimumValue = value;
        }
        load(data) {
            var _a;
            if (data === undefined) {
                return;
            }
            super.load(data);
            if (data.destroy !== undefined) {
                this.destroy = data.destroy;
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            this.minimumValue = (_a = data.minimumValue) !== null && _a !== void 0 ? _a : data.opacity_min;
            if (data.speed !== undefined) {
                this.speed = data.speed;
            }
            if (data.startValue !== undefined) {
                this.startValue = data.startValue;
            }
            if (data.sync !== undefined) {
                this.sync = data.sync;
            }
        }
    }
    exports.OpacityAnimation = OpacityAnimation;
    });

    unwrapExports(OpacityAnimation_1);
    OpacityAnimation_1.OpacityAnimation;

    var Opacity_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Opacity = void 0;



    class Opacity extends ValueWithRandom_1.ValueWithRandom {
        constructor() {
            super();
            this.animation = new OpacityAnimation_1.OpacityAnimation();
            this.random.minimumValue = 0.1;
            this.value = 1;
        }
        get anim() {
            return this.animation;
        }
        set anim(value) {
            this.animation = value;
        }
        load(data) {
            var _a;
            if (!data) {
                return;
            }
            super.load(data);
            const animation = (_a = data.animation) !== null && _a !== void 0 ? _a : data.anim;
            if (animation !== undefined) {
                this.animation.load(animation);
                this.value = (0, Utils$2.setRangeValue)(this.value, this.animation.enable ? this.animation.minimumValue : undefined);
            }
        }
    }
    exports.Opacity = Opacity;
    });

    unwrapExports(Opacity_1);
    Opacity_1.Opacity;

    var Shape_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Shape = void 0;


    class Shape {
        constructor() {
            this.options = {};
            this.type = Enums$3.ShapeType.circle;
        }
        get image() {
            var _a;
            return ((_a = this.options[Enums$3.ShapeType.image]) !== null && _a !== void 0 ? _a : this.options[Enums$3.ShapeType.images]);
        }
        set image(value) {
            this.options[Enums$3.ShapeType.image] = value;
            this.options[Enums$3.ShapeType.images] = value;
        }
        get custom() {
            return this.options;
        }
        set custom(value) {
            this.options = value;
        }
        get images() {
            return this.image;
        }
        set images(value) {
            this.image = value;
        }
        get stroke() {
            return [];
        }
        set stroke(_value) {
        }
        get character() {
            var _a;
            return ((_a = this.options[Enums$3.ShapeType.character]) !== null && _a !== void 0 ? _a : this.options[Enums$3.ShapeType.char]);
        }
        set character(value) {
            this.options[Enums$3.ShapeType.character] = value;
            this.options[Enums$3.ShapeType.char] = value;
        }
        get polygon() {
            var _a;
            return ((_a = this.options[Enums$3.ShapeType.polygon]) !== null && _a !== void 0 ? _a : this.options[Enums$3.ShapeType.star]);
        }
        set polygon(value) {
            this.options[Enums$3.ShapeType.polygon] = value;
            this.options[Enums$3.ShapeType.star] = value;
        }
        load(data) {
            var _a, _b, _c;
            if (data === undefined) {
                return;
            }
            const options = (_a = data.options) !== null && _a !== void 0 ? _a : data.custom;
            if (options !== undefined) {
                for (const shape in options) {
                    const item = options[shape];
                    if (item !== undefined) {
                        this.options[shape] = (0, Utils$2.deepExtend)((_b = this.options[shape]) !== null && _b !== void 0 ? _b : {}, item);
                    }
                }
            }
            this.loadShape(data.character, Enums$3.ShapeType.character, Enums$3.ShapeType.char, true);
            this.loadShape(data.polygon, Enums$3.ShapeType.polygon, Enums$3.ShapeType.star, false);
            this.loadShape((_c = data.image) !== null && _c !== void 0 ? _c : data.images, Enums$3.ShapeType.image, Enums$3.ShapeType.images, true);
            if (data.type !== undefined) {
                this.type = data.type;
            }
        }
        loadShape(item, mainKey, altKey, altOverride) {
            var _a, _b, _c, _d;
            if (item === undefined) {
                return;
            }
            if (item instanceof Array) {
                if (!(this.options[mainKey] instanceof Array)) {
                    this.options[mainKey] = [];
                    if (!this.options[altKey] || altOverride) {
                        this.options[altKey] = [];
                    }
                }
                this.options[mainKey] = (0, Utils$2.deepExtend)((_a = this.options[mainKey]) !== null && _a !== void 0 ? _a : [], item);
                if (!this.options[altKey] || altOverride) {
                    this.options[altKey] = (0, Utils$2.deepExtend)((_b = this.options[altKey]) !== null && _b !== void 0 ? _b : [], item);
                }
            }
            else {
                if (this.options[mainKey] instanceof Array) {
                    this.options[mainKey] = {};
                    if (!this.options[altKey] || altOverride) {
                        this.options[altKey] = {};
                    }
                }
                this.options[mainKey] = (0, Utils$2.deepExtend)((_c = this.options[mainKey]) !== null && _c !== void 0 ? _c : {}, item);
                if (!this.options[altKey] || altOverride) {
                    this.options[altKey] = (0, Utils$2.deepExtend)((_d = this.options[altKey]) !== null && _d !== void 0 ? _d : {}, item);
                }
            }
        }
    }
    exports.Shape = Shape;
    });

    unwrapExports(Shape_1);
    Shape_1.Shape;

    var SizeAnimation_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SizeAnimation = void 0;


    class SizeAnimation extends AnimationOptions_1.AnimationOptions {
        constructor() {
            super();
            this.destroy = Enums$3.DestroyType.none;
            this.enable = false;
            this.speed = 5;
            this.startValue = Enums$3.StartValueType.random;
            this.sync = false;
        }
        get size_min() {
            return this.minimumValue;
        }
        set size_min(value) {
            this.minimumValue = value;
        }
        load(data) {
            var _a;
            if (data === undefined) {
                return;
            }
            super.load(data);
            if (data.destroy !== undefined) {
                this.destroy = data.destroy;
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            this.minimumValue = (_a = data.minimumValue) !== null && _a !== void 0 ? _a : data.size_min;
            if (data.speed !== undefined) {
                this.speed = data.speed;
            }
            if (data.startValue !== undefined) {
                this.startValue = data.startValue;
            }
            if (data.sync !== undefined) {
                this.sync = data.sync;
            }
        }
    }
    exports.SizeAnimation = SizeAnimation;
    });

    unwrapExports(SizeAnimation_1);
    SizeAnimation_1.SizeAnimation;

    var Size_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Size = void 0;



    class Size extends ValueWithRandom_1.ValueWithRandom {
        constructor() {
            super();
            this.animation = new SizeAnimation_1.SizeAnimation();
            this.random.minimumValue = 1;
            this.value = 3;
        }
        get anim() {
            return this.animation;
        }
        set anim(value) {
            this.animation = value;
        }
        load(data) {
            var _a;
            if (!data) {
                return;
            }
            super.load(data);
            const animation = (_a = data.animation) !== null && _a !== void 0 ? _a : data.anim;
            if (animation !== undefined) {
                this.animation.load(animation);
                this.value = (0, Utils$2.setRangeValue)(this.value, this.animation.enable ? this.animation.minimumValue : undefined);
            }
        }
    }
    exports.Size = Size;
    });

    unwrapExports(Size_1);
    Size_1.Size;

    var RotateAnimation_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.RotateAnimation = void 0;
    class RotateAnimation {
        constructor() {
            this.enable = false;
            this.speed = 0;
            this.sync = false;
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            if (data.speed !== undefined) {
                this.speed = data.speed;
            }
            if (data.sync !== undefined) {
                this.sync = data.sync;
            }
        }
    }
    exports.RotateAnimation = RotateAnimation;
    });

    unwrapExports(RotateAnimation_1);
    RotateAnimation_1.RotateAnimation;

    var Rotate_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Rotate = void 0;



    class Rotate extends ValueWithRandom_1.ValueWithRandom {
        constructor() {
            super();
            this.animation = new RotateAnimation_1.RotateAnimation();
            this.direction = Enums$3.RotateDirection.clockwise;
            this.path = false;
            this.value = 0;
        }
        load(data) {
            if (!data) {
                return;
            }
            super.load(data);
            if (data.direction !== undefined) {
                this.direction = data.direction;
            }
            this.animation.load(data.animation);
            if (data.path !== undefined) {
                this.path = data.path;
            }
        }
    }
    exports.Rotate = Rotate;
    });

    unwrapExports(Rotate_1);
    Rotate_1.Rotate;

    var Shadow_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Shadow = void 0;

    class Shadow {
        constructor() {
            this.blur = 0;
            this.color = new OptionsColor_1.OptionsColor();
            this.enable = false;
            this.offset = {
                x: 0,
                y: 0,
            };
            this.color.value = "#000000";
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.blur !== undefined) {
                this.blur = data.blur;
            }
            this.color = OptionsColor_1.OptionsColor.create(this.color, data.color);
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            if (data.offset === undefined) {
                return;
            }
            if (data.offset.x !== undefined) {
                this.offset.x = data.offset.x;
            }
            if (data.offset.y !== undefined) {
                this.offset.y = data.offset.y;
            }
        }
    }
    exports.Shadow = Shadow;
    });

    unwrapExports(Shadow_1);
    Shadow_1.Shadow;

    var ColorAnimation_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ColorAnimation = void 0;

    class ColorAnimation {
        constructor() {
            this.count = 0;
            this.enable = false;
            this.offset = 0;
            this.speed = 1;
            this.sync = true;
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.count !== undefined) {
                this.count = data.count;
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            if (data.offset !== undefined) {
                this.offset = (0, Utils$2.setRangeValue)(data.offset);
            }
            if (data.speed !== undefined) {
                this.speed = data.speed;
            }
            if (data.sync !== undefined) {
                this.sync = data.sync;
            }
        }
    }
    exports.ColorAnimation = ColorAnimation;
    });

    unwrapExports(ColorAnimation_1);
    ColorAnimation_1.ColorAnimation;

    var HslAnimation_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.HslAnimation = void 0;

    class HslAnimation {
        constructor() {
            this.h = new ColorAnimation_1.ColorAnimation();
            this.s = new ColorAnimation_1.ColorAnimation();
            this.l = new ColorAnimation_1.ColorAnimation();
        }
        load(data) {
            if (!data) {
                return;
            }
            this.h.load(data.h);
            this.s.load(data.s);
            this.l.load(data.l);
        }
    }
    exports.HslAnimation = HslAnimation;
    });

    unwrapExports(HslAnimation_1);
    HslAnimation_1.HslAnimation;

    var AnimatableColor_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AnimatableColor = void 0;


    class AnimatableColor extends OptionsColor_1.OptionsColor {
        constructor() {
            super();
            this.animation = new HslAnimation_1.HslAnimation();
        }
        static create(source, data) {
            const color = new AnimatableColor();
            color.load(source);
            if (data !== undefined) {
                if (typeof data === "string" || data instanceof Array) {
                    color.load({ value: data });
                }
                else {
                    color.load(data);
                }
            }
            return color;
        }
        load(data) {
            super.load(data);
            if (!data) {
                return;
            }
            const colorAnimation = data.animation;
            if (colorAnimation !== undefined) {
                if (colorAnimation.enable !== undefined) {
                    this.animation.h.load(colorAnimation);
                }
                else {
                    this.animation.load(data.animation);
                }
            }
        }
    }
    exports.AnimatableColor = AnimatableColor;
    });

    unwrapExports(AnimatableColor_1);
    AnimatableColor_1.AnimatableColor;

    var Stroke_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Stroke = void 0;

    class Stroke {
        constructor() {
            this.width = 0;
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.color !== undefined) {
                this.color = AnimatableColor_1.AnimatableColor.create(this.color, data.color);
            }
            if (data.width !== undefined) {
                this.width = data.width;
            }
            if (data.opacity !== undefined) {
                this.opacity = data.opacity;
            }
        }
    }
    exports.Stroke = Stroke;
    });

    unwrapExports(Stroke_1);
    Stroke_1.Stroke;

    var BounceFactor_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.BounceFactor = void 0;

    class BounceFactor extends ValueWithRandom_1.ValueWithRandom {
        constructor() {
            super();
            this.random.minimumValue = 0.1;
            this.value = 1;
        }
    }
    exports.BounceFactor = BounceFactor;
    });

    unwrapExports(BounceFactor_1);
    BounceFactor_1.BounceFactor;

    var Bounce_1$1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Bounce = void 0;

    class Bounce {
        constructor() {
            this.horizontal = new BounceFactor_1.BounceFactor();
            this.vertical = new BounceFactor_1.BounceFactor();
        }
        load(data) {
            if (!data) {
                return;
            }
            this.horizontal.load(data.horizontal);
            this.vertical.load(data.vertical);
        }
    }
    exports.Bounce = Bounce;
    });

    unwrapExports(Bounce_1$1);
    Bounce_1$1.Bounce;

    var CollisionsOverlap_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CollisionsOverlap = void 0;
    class CollisionsOverlap {
        constructor() {
            this.enable = true;
            this.retries = 0;
        }
        load(data) {
            if (!data) {
                return;
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            if (data.retries !== undefined) {
                this.retries = data.retries;
            }
        }
    }
    exports.CollisionsOverlap = CollisionsOverlap;
    });

    unwrapExports(CollisionsOverlap_1);
    CollisionsOverlap_1.CollisionsOverlap;

    var Collisions_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Collisions = void 0;



    class Collisions {
        constructor() {
            this.bounce = new Bounce_1$1.Bounce();
            this.enable = false;
            this.mode = Enums$3.CollisionMode.bounce;
            this.overlap = new CollisionsOverlap_1.CollisionsOverlap();
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            this.bounce.load(data.bounce);
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            if (data.mode !== undefined) {
                this.mode = data.mode;
            }
            this.overlap.load(data.overlap);
        }
    }
    exports.Collisions = Collisions;
    });

    unwrapExports(Collisions_1);
    Collisions_1.Collisions;

    var TwinkleValues_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.TwinkleValues = void 0;

    class TwinkleValues {
        constructor() {
            this.enable = false;
            this.frequency = 0.05;
            this.opacity = 1;
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.color !== undefined) {
                this.color = OptionsColor_1.OptionsColor.create(this.color, data.color);
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            if (data.frequency !== undefined) {
                this.frequency = data.frequency;
            }
            if (data.opacity !== undefined) {
                this.opacity = data.opacity;
            }
        }
    }
    exports.TwinkleValues = TwinkleValues;
    });

    unwrapExports(TwinkleValues_1);
    TwinkleValues_1.TwinkleValues;

    var Twinkle_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Twinkle = void 0;

    class Twinkle {
        constructor() {
            this.lines = new TwinkleValues_1.TwinkleValues();
            this.particles = new TwinkleValues_1.TwinkleValues();
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            this.lines.load(data.lines);
            this.particles.load(data.particles);
        }
    }
    exports.Twinkle = Twinkle;
    });

    unwrapExports(Twinkle_1);
    Twinkle_1.Twinkle;

    var LifeDelay_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.LifeDelay = void 0;

    class LifeDelay extends ValueWithRandom_1.ValueWithRandom {
        constructor() {
            super();
            this.sync = false;
        }
        load(data) {
            if (!data) {
                return;
            }
            super.load(data);
            if (data.sync !== undefined) {
                this.sync = data.sync;
            }
        }
    }
    exports.LifeDelay = LifeDelay;
    });

    unwrapExports(LifeDelay_1);
    LifeDelay_1.LifeDelay;

    var LifeDuration_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.LifeDuration = void 0;

    class LifeDuration extends ValueWithRandom_1.ValueWithRandom {
        constructor() {
            super();
            this.random.minimumValue = 0.0001;
            this.sync = false;
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            super.load(data);
            if (data.sync !== undefined) {
                this.sync = data.sync;
            }
        }
    }
    exports.LifeDuration = LifeDuration;
    });

    unwrapExports(LifeDuration_1);
    LifeDuration_1.LifeDuration;

    var Life_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Life = void 0;


    class Life {
        constructor() {
            this.count = 0;
            this.delay = new LifeDelay_1.LifeDelay();
            this.duration = new LifeDuration_1.LifeDuration();
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.count !== undefined) {
                this.count = data.count;
            }
            this.delay.load(data.delay);
            this.duration.load(data.duration);
        }
    }
    exports.Life = Life;
    });

    unwrapExports(Life_1);
    Life_1.Life;

    var SplitFactor_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SplitFactor = void 0;

    class SplitFactor extends ValueWithRandom_1.ValueWithRandom {
        constructor() {
            super();
            this.value = 3;
        }
    }
    exports.SplitFactor = SplitFactor;
    });

    unwrapExports(SplitFactor_1);
    SplitFactor_1.SplitFactor;

    var SplitRate_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SplitRate = void 0;

    class SplitRate extends ValueWithRandom_1.ValueWithRandom {
        constructor() {
            super();
            this.value = { min: 4, max: 9 };
        }
    }
    exports.SplitRate = SplitRate;
    });

    unwrapExports(SplitRate_1);
    SplitRate_1.SplitRate;

    var Split_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Split = void 0;



    class Split {
        constructor() {
            this.count = 1;
            this.factor = new SplitFactor_1.SplitFactor();
            this.rate = new SplitRate_1.SplitRate();
            this.sizeOffset = true;
        }
        load(data) {
            if (!data) {
                return;
            }
            if (data.count !== undefined) {
                this.count = data.count;
            }
            this.factor.load(data.factor);
            this.rate.load(data.rate);
            if (data.particles !== undefined) {
                this.particles = (0, Utils$2.deepExtend)({}, data.particles);
            }
            if (data.sizeOffset !== undefined) {
                this.sizeOffset = data.sizeOffset;
            }
        }
    }
    exports.Split = Split;
    });

    unwrapExports(Split_1);
    Split_1.Split;

    var Destroy_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Destroy = void 0;


    class Destroy {
        constructor() {
            this.mode = Enums$3.DestroyMode.none;
            this.split = new Split_1.Split();
        }
        load(data) {
            if (!data) {
                return;
            }
            if (data.mode !== undefined) {
                this.mode = data.mode;
            }
            this.split.load(data.split);
        }
    }
    exports.Destroy = Destroy;
    });

    unwrapExports(Destroy_1);
    Destroy_1.Destroy;

    var Wobble_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Wobble = void 0;

    class Wobble {
        constructor() {
            this.distance = 5;
            this.enable = false;
            this.speed = 50;
        }
        load(data) {
            if (!data) {
                return;
            }
            if (data.distance !== undefined) {
                this.distance = (0, Utils$2.setRangeValue)(data.distance);
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            if (data.speed !== undefined) {
                this.speed = (0, Utils$2.setRangeValue)(data.speed);
            }
        }
    }
    exports.Wobble = Wobble;
    });

    unwrapExports(Wobble_1);
    Wobble_1.Wobble;

    var TiltAnimation_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.TiltAnimation = void 0;
    class TiltAnimation {
        constructor() {
            this.enable = false;
            this.speed = 0;
            this.sync = false;
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            if (data.speed !== undefined) {
                this.speed = data.speed;
            }
            if (data.sync !== undefined) {
                this.sync = data.sync;
            }
        }
    }
    exports.TiltAnimation = TiltAnimation;
    });

    unwrapExports(TiltAnimation_1);
    TiltAnimation_1.TiltAnimation;

    var Tilt_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Tilt = void 0;



    class Tilt extends ValueWithRandom_1.ValueWithRandom {
        constructor() {
            super();
            this.animation = new TiltAnimation_1.TiltAnimation();
            this.direction = Enums$3.TiltDirection.clockwise;
            this.enable = false;
            this.value = 0;
        }
        load(data) {
            if (!data) {
                return;
            }
            super.load(data);
            this.animation.load(data.animation);
            if (data.direction !== undefined) {
                this.direction = data.direction;
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
        }
    }
    exports.Tilt = Tilt;
    });

    unwrapExports(Tilt_1);
    Tilt_1.Tilt;

    var RollLight_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.RollLight = void 0;
    class RollLight {
        constructor() {
            this.enable = false;
            this.value = 0;
        }
        load(data) {
            if (!data) {
                return;
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            if (data.value !== undefined) {
                this.value = data.value;
            }
        }
    }
    exports.RollLight = RollLight;
    });

    unwrapExports(RollLight_1);
    RollLight_1.RollLight;

    var Roll_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Roll = void 0;




    class Roll {
        constructor() {
            this.darken = new RollLight_1.RollLight();
            this.enable = false;
            this.enlighten = new RollLight_1.RollLight();
            this.mode = Enums$3.RollMode.vertical;
            this.speed = 25;
        }
        load(data) {
            if (!data) {
                return;
            }
            if (data.backColor !== undefined) {
                this.backColor = OptionsColor_1.OptionsColor.create(this.backColor, data.backColor);
            }
            this.darken.load(data.darken);
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            this.enlighten.load(data.enlighten);
            if (data.mode !== undefined) {
                this.mode = data.mode;
            }
            if (data.speed !== undefined) {
                this.speed = (0, Utils$2.setRangeValue)(data.speed);
            }
        }
    }
    exports.Roll = Roll;
    });

    unwrapExports(Roll_1);
    Roll_1.Roll;

    var ZIndex_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ZIndex = void 0;

    class ZIndex extends ValueWithRandom_1.ValueWithRandom {
        constructor() {
            super();
            this.opacityRate = 1;
            this.sizeRate = 1;
            this.velocityRate = 1;
        }
        load(data) {
            super.load(data);
            if (!data) {
                return;
            }
            if (data.opacityRate !== undefined) {
                this.opacityRate = data.opacityRate;
            }
            if (data.sizeRate !== undefined) {
                this.sizeRate = data.sizeRate;
            }
            if (data.velocityRate !== undefined) {
                this.velocityRate = data.velocityRate;
            }
        }
    }
    exports.ZIndex = ZIndex;
    });

    unwrapExports(ZIndex_1);
    ZIndex_1.ZIndex;

    var OrbitRotation_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.OrbitRotation = void 0;

    class OrbitRotation extends ValueWithRandom_1.ValueWithRandom {
        constructor() {
            super();
            this.value = 45;
            this.random.enable = false;
            this.random.minimumValue = 0;
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            super.load(data);
        }
    }
    exports.OrbitRotation = OrbitRotation;
    });

    unwrapExports(OrbitRotation_1);
    OrbitRotation_1.OrbitRotation;

    var Orbit_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Orbit = void 0;



    class Orbit {
        constructor() {
            this.animation = new AnimationOptions_1.AnimationOptions();
            this.enable = false;
            this.opacity = 1;
            this.rotation = new OrbitRotation_1.OrbitRotation();
            this.width = 1;
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            this.animation.load(data.animation);
            this.rotation.load(data.rotation);
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            if (data.opacity !== undefined) {
                this.opacity = data.opacity;
            }
            if (data.width !== undefined) {
                this.width = data.width;
            }
            if (data.radius !== undefined) {
                this.radius = data.radius;
            }
            if (data.color !== undefined) {
                this.color = OptionsColor_1.OptionsColor.create(this.color, data.color);
            }
        }
    }
    exports.Orbit = Orbit;
    });

    unwrapExports(Orbit_1);
    Orbit_1.Orbit;

    var Repulse_1$1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Repulse = void 0;

    class Repulse extends ValueWithRandom_1.ValueWithRandom {
        constructor() {
            super();
            this.enabled = false;
            this.distance = 1;
            this.duration = 1;
            this.factor = 1;
            this.speed = 1;
        }
        load(data) {
            super.load(data);
            if (!data) {
                return;
            }
            if (data.enabled !== undefined) {
                this.enabled = data.enabled;
            }
            if (data.distance !== undefined) {
                this.distance = data.distance;
            }
            if (data.duration !== undefined) {
                this.duration = data.duration;
            }
            if (data.factor !== undefined) {
                this.factor = data.factor;
            }
            if (data.speed !== undefined) {
                this.speed = data.speed;
            }
        }
    }
    exports.Repulse = Repulse;
    });

    unwrapExports(Repulse_1$1);
    Repulse_1$1.Repulse;

    var AnimatableGradient_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.GradientColorOpacityAnimation = exports.GradientAngleAnimation = exports.AnimatableGradientColor = exports.GradientColorOpacity = exports.GradientAngle = exports.AnimatableGradient = void 0;



    class AnimatableGradient {
        constructor() {
            this.angle = new GradientAngle();
            this.colors = [];
            this.type = Enums$3.GradientType.random;
        }
        load(data) {
            if (!data) {
                return;
            }
            this.angle.load(data.angle);
            if (data.colors !== undefined) {
                this.colors = data.colors.map((s) => {
                    const tmp = new AnimatableGradientColor();
                    tmp.load(s);
                    return tmp;
                });
            }
            if (data.type !== undefined) {
                this.type = data.type;
            }
        }
    }
    exports.AnimatableGradient = AnimatableGradient;
    class GradientAngle {
        constructor() {
            this.value = 0;
            this.animation = new GradientAngleAnimation();
            this.direction = Enums$3.RotateDirection.clockwise;
        }
        load(data) {
            if (!data) {
                return;
            }
            this.animation.load(data.animation);
            if (data.value !== undefined) {
                this.value = data.value;
            }
            if (data.direction !== undefined) {
                this.direction = data.direction;
            }
        }
    }
    exports.GradientAngle = GradientAngle;
    class GradientColorOpacity {
        constructor() {
            this.value = 0;
            this.animation = new GradientColorOpacityAnimation();
        }
        load(data) {
            if (!data) {
                return;
            }
            this.animation.load(data.animation);
            if (data.value !== undefined) {
                this.value = (0, Utils$2.setRangeValue)(data.value);
            }
        }
    }
    exports.GradientColorOpacity = GradientColorOpacity;
    class AnimatableGradientColor {
        constructor() {
            this.stop = 0;
            this.value = new AnimatableColor_1.AnimatableColor();
        }
        load(data) {
            if (!data) {
                return;
            }
            if (data.stop !== undefined) {
                this.stop = data.stop;
            }
            this.value = AnimatableColor_1.AnimatableColor.create(this.value, data.value);
            if (data.opacity !== undefined) {
                this.opacity = new GradientColorOpacity();
                if (typeof data.opacity === "number") {
                    this.opacity.value = data.opacity;
                }
                else {
                    this.opacity.load(data.opacity);
                }
            }
        }
    }
    exports.AnimatableGradientColor = AnimatableGradientColor;
    class GradientAngleAnimation {
        constructor() {
            this.count = 0;
            this.enable = false;
            this.speed = 0;
            this.sync = false;
        }
        load(data) {
            if (!data) {
                return;
            }
            if (data.count !== undefined) {
                this.count = data.count;
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            if (data.speed !== undefined) {
                this.speed = data.speed;
            }
            if (data.sync !== undefined) {
                this.sync = data.sync;
            }
        }
    }
    exports.GradientAngleAnimation = GradientAngleAnimation;
    class GradientColorOpacityAnimation {
        constructor() {
            this.count = 0;
            this.enable = false;
            this.speed = 0;
            this.sync = false;
            this.startValue = Enums$3.StartValueType.random;
        }
        load(data) {
            if (!data) {
                return;
            }
            if (data.count !== undefined) {
                this.count = data.count;
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            if (data.speed !== undefined) {
                this.speed = data.speed;
            }
            if (data.sync !== undefined) {
                this.sync = data.sync;
            }
            if (data.startValue !== undefined) {
                this.startValue = data.startValue;
            }
        }
    }
    exports.GradientColorOpacityAnimation = GradientColorOpacityAnimation;
    });

    unwrapExports(AnimatableGradient_1);
    AnimatableGradient_1.GradientColorOpacityAnimation;
    AnimatableGradient_1.GradientAngleAnimation;
    AnimatableGradient_1.AnimatableGradientColor;
    AnimatableGradient_1.GradientColorOpacity;
    AnimatableGradient_1.GradientAngle;
    AnimatableGradient_1.AnimatableGradient;

    var ParticlesOptions_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ParticlesOptions = void 0;























    class ParticlesOptions {
        constructor() {
            this.bounce = new Bounce_1$1.Bounce();
            this.collisions = new Collisions_1.Collisions();
            this.color = new AnimatableColor_1.AnimatableColor();
            this.destroy = new Destroy_1.Destroy();
            this.gradient = [];
            this.groups = {};
            this.life = new Life_1.Life();
            this.links = new Links_1.Links();
            this.move = new Move_1$1.Move();
            this.number = new ParticlesNumber_1.ParticlesNumber();
            this.opacity = new Opacity_1.Opacity();
            this.orbit = new Orbit_1.Orbit();
            this.reduceDuplicates = false;
            this.repulse = new Repulse_1$1.Repulse();
            this.roll = new Roll_1.Roll();
            this.rotate = new Rotate_1.Rotate();
            this.shadow = new Shadow_1.Shadow();
            this.shape = new Shape_1.Shape();
            this.size = new Size_1.Size();
            this.stroke = new Stroke_1.Stroke();
            this.tilt = new Tilt_1.Tilt();
            this.twinkle = new Twinkle_1.Twinkle();
            this.wobble = new Wobble_1.Wobble();
            this.zIndex = new ZIndex_1.ZIndex();
        }
        get line_linked() {
            return this.links;
        }
        set line_linked(value) {
            this.links = value;
        }
        get lineLinked() {
            return this.links;
        }
        set lineLinked(value) {
            this.links = value;
        }
        load(data) {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            if (data === undefined) {
                return;
            }
            this.bounce.load(data.bounce);
            this.color.load(AnimatableColor_1.AnimatableColor.create(this.color, data.color));
            this.destroy.load(data.destroy);
            this.life.load(data.life);
            const links = (_b = (_a = data.links) !== null && _a !== void 0 ? _a : data.lineLinked) !== null && _b !== void 0 ? _b : data.line_linked;
            if (links !== undefined) {
                this.links.load(links);
            }
            if (data.groups !== undefined) {
                for (const group in data.groups) {
                    const item = data.groups[group];
                    if (item !== undefined) {
                        this.groups[group] = (0, Utils$2.deepExtend)((_c = this.groups[group]) !== null && _c !== void 0 ? _c : {}, item);
                    }
                }
            }
            this.move.load(data.move);
            this.number.load(data.number);
            this.opacity.load(data.opacity);
            this.orbit.load(data.orbit);
            if (data.reduceDuplicates !== undefined) {
                this.reduceDuplicates = data.reduceDuplicates;
            }
            this.repulse.load(data.repulse);
            this.roll.load(data.roll);
            this.rotate.load(data.rotate);
            this.shape.load(data.shape);
            this.size.load(data.size);
            this.shadow.load(data.shadow);
            this.tilt.load(data.tilt);
            this.twinkle.load(data.twinkle);
            this.wobble.load(data.wobble);
            this.zIndex.load(data.zIndex);
            const collisions = (_e = (_d = data.move) === null || _d === void 0 ? void 0 : _d.collisions) !== null && _e !== void 0 ? _e : (_f = data.move) === null || _f === void 0 ? void 0 : _f.bounce;
            if (collisions !== undefined) {
                this.collisions.enable = collisions;
            }
            this.collisions.load(data.collisions);
            const strokeToLoad = (_g = data.stroke) !== null && _g !== void 0 ? _g : (_h = data.shape) === null || _h === void 0 ? void 0 : _h.stroke;
            if (strokeToLoad) {
                if (strokeToLoad instanceof Array) {
                    this.stroke = strokeToLoad.map((s) => {
                        const tmp = new Stroke_1.Stroke();
                        tmp.load(s);
                        return tmp;
                    });
                }
                else {
                    if (this.stroke instanceof Array) {
                        this.stroke = new Stroke_1.Stroke();
                    }
                    this.stroke.load(strokeToLoad);
                }
            }
            const gradientToLoad = data.gradient;
            if (gradientToLoad) {
                if (gradientToLoad instanceof Array) {
                    this.gradient = gradientToLoad.map((s) => {
                        const tmp = new AnimatableGradient_1.AnimatableGradient();
                        tmp.load(s);
                        return tmp;
                    });
                }
                else {
                    if (this.gradient instanceof Array) {
                        this.gradient = new AnimatableGradient_1.AnimatableGradient();
                    }
                    this.gradient.load(gradientToLoad);
                }
            }
        }
    }
    exports.ParticlesOptions = ParticlesOptions;
    });

    unwrapExports(ParticlesOptions_1);
    ParticlesOptions_1.ParticlesOptions;

    var Vector3d_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Vector3d = void 0;

    class Vector3d extends Vector_1.Vector {
        constructor(x, y, z) {
            super(x, y);
            this.z = z === undefined ? x.z : z;
        }
        static clone(source) {
            return Vector3d.create(source.x, source.y, source.z);
        }
        static create(x, y, z) {
            return new Vector3d(x, y, z);
        }
        add(v) {
            return v instanceof Vector3d ? Vector3d.create(this.x + v.x, this.y + v.y, this.z + v.z) : super.add(v);
        }
        addTo(v) {
            super.addTo(v);
            if (v instanceof Vector3d) {
                this.z += v.z;
            }
        }
        sub(v) {
            return v instanceof Vector3d ? Vector3d.create(this.x - v.x, this.y - v.y, this.z - v.z) : super.sub(v);
        }
        subFrom(v) {
            super.subFrom(v);
            if (v instanceof Vector3d) {
                this.z -= v.z;
            }
        }
        mult(n) {
            return Vector3d.create(this.x * n, this.y * n, this.z * n);
        }
        multTo(n) {
            super.multTo(n);
            this.z *= n;
        }
        div(n) {
            return Vector3d.create(this.x / n, this.y / n, this.z / n);
        }
        divTo(n) {
            super.divTo(n);
            this.z /= n;
        }
        copy() {
            return Vector3d.clone(this);
        }
        setTo(v) {
            super.setTo(v);
            if (v instanceof Vector3d) {
                this.z = v.z;
            }
        }
    }
    exports.Vector3d = Vector3d;
    });

    unwrapExports(Vector3d_1);
    Vector3d_1.Vector3d;

    var Particle_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Particle = void 0;






    const fixOutMode = (data) => {
        if ((0, Utils$2.isInArray)(data.outMode, data.checkModes) || (0, Utils$2.isInArray)(data.outMode, data.checkModes)) {
            if (data.coord > data.maxCoord - data.radius * 2) {
                data.setCb(-data.radius);
            }
            else if (data.coord < data.radius * 2) {
                data.setCb(data.radius);
            }
        }
    };
    class Particle {
        constructor(id, container, position, overrideOptions, group) {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j;
            this.id = id;
            this.container = container;
            this.group = group;
            this.fill = true;
            this.close = true;
            this.lastPathTime = 0;
            this.destroyed = false;
            this.unbreakable = false;
            this.splitCount = 0;
            this.misplaced = false;
            this.retina = {
                maxDistance: {},
            };
            const pxRatio = container.retina.pixelRatio;
            const mainOptions = container.actualOptions;
            const particlesOptions = new ParticlesOptions_1.ParticlesOptions();
            particlesOptions.load(mainOptions.particles);
            const shapeType = particlesOptions.shape.type;
            const reduceDuplicates = particlesOptions.reduceDuplicates;
            this.shape = shapeType instanceof Array ? (0, Utils$2.itemFromArray)(shapeType, this.id, reduceDuplicates) : shapeType;
            if (overrideOptions === null || overrideOptions === void 0 ? void 0 : overrideOptions.shape) {
                if (overrideOptions.shape.type) {
                    const overrideShapeType = overrideOptions.shape.type;
                    this.shape =
                        overrideShapeType instanceof Array
                            ? (0, Utils$2.itemFromArray)(overrideShapeType, this.id, reduceDuplicates)
                            : overrideShapeType;
                }
                const shapeOptions = new Shape_1.Shape();
                shapeOptions.load(overrideOptions.shape);
                if (this.shape) {
                    this.shapeData = this.loadShapeData(shapeOptions, reduceDuplicates);
                }
            }
            else {
                this.shapeData = this.loadShapeData(particlesOptions.shape, reduceDuplicates);
            }
            if (overrideOptions !== undefined) {
                particlesOptions.load(overrideOptions);
            }
            if (((_a = this.shapeData) === null || _a === void 0 ? void 0 : _a.particles) !== undefined) {
                particlesOptions.load((_b = this.shapeData) === null || _b === void 0 ? void 0 : _b.particles);
            }
            this.fill = (_d = (_c = this.shapeData) === null || _c === void 0 ? void 0 : _c.fill) !== null && _d !== void 0 ? _d : this.fill;
            this.close = (_f = (_e = this.shapeData) === null || _e === void 0 ? void 0 : _e.close) !== null && _f !== void 0 ? _f : this.close;
            this.options = particlesOptions;
            this.pathDelay = (0, Utils$2.getValue)(this.options.move.path.delay) * 1000;
            const zIndexValue = (0, Utils$2.getRangeValue)(this.options.zIndex.value);
            container.retina.initParticle(this);
            const sizeOptions = this.options.size, sizeRange = sizeOptions.value;
            this.size = {
                enable: sizeOptions.animation.enable,
                value: (0, Utils$2.getValue)(sizeOptions) * container.retina.pixelRatio,
                max: (0, Utils$2.getRangeMax)(sizeRange) * pxRatio,
                min: (0, Utils$2.getRangeMin)(sizeRange) * pxRatio,
                loops: 0,
                maxLoops: sizeOptions.animation.count,
            };
            const sizeAnimation = sizeOptions.animation;
            if (sizeAnimation.enable) {
                this.size.status = Enums$3.AnimationStatus.increasing;
                switch (sizeAnimation.startValue) {
                    case Enums$3.StartValueType.min:
                        this.size.value = this.size.min;
                        this.size.status = Enums$3.AnimationStatus.increasing;
                        break;
                    case Enums$3.StartValueType.random:
                        this.size.value = (0, Utils$2.randomInRange)(this.size) * pxRatio;
                        this.size.status = Math.random() >= 0.5 ? Enums$3.AnimationStatus.increasing : Enums$3.AnimationStatus.decreasing;
                        break;
                    case Enums$3.StartValueType.max:
                    default:
                        this.size.value = this.size.max;
                        this.size.status = Enums$3.AnimationStatus.decreasing;
                        break;
                }
                this.size.velocity =
                    (((_g = this.retina.sizeAnimationSpeed) !== null && _g !== void 0 ? _g : container.retina.sizeAnimationSpeed) / 100) *
                        container.retina.reduceFactor;
                if (!sizeAnimation.sync) {
                    this.size.velocity *= Math.random();
                }
            }
            this.direction = (0, Utils$2.getParticleDirectionAngle)(this.options.move.direction);
            this.bubble = {
                inRange: false,
            };
            this.initialVelocity = this.calculateVelocity();
            this.velocity = this.initialVelocity.copy();
            this.moveDecay = 1 - (0, Utils$2.getRangeValue)(this.options.move.decay);
            this.position = this.calcPosition(container, position, (0, Utils$2.clamp)(zIndexValue, 0, container.zLayers));
            this.initialPosition = this.position.copy();
            this.offset = Vector_1.Vector.origin;
            const particles = container.particles;
            particles.needsSort = particles.needsSort || particles.lastZIndex < this.position.z;
            particles.lastZIndex = this.position.z;
            this.zIndexFactor = this.position.z / container.zLayers;
            this.sides = 24;
            let drawer = container.drawers.get(this.shape);
            if (!drawer) {
                drawer = Utils$2.Plugins.getShapeDrawer(this.shape);
                if (drawer) {
                    container.drawers.set(this.shape, drawer);
                }
            }
            if (drawer === null || drawer === void 0 ? void 0 : drawer.loadShape) {
                drawer === null || drawer === void 0 ? void 0 : drawer.loadShape(this);
            }
            const sideCountFunc = drawer === null || drawer === void 0 ? void 0 : drawer.getSidesCount;
            if (sideCountFunc) {
                this.sides = sideCountFunc(this);
            }
            this.life = this.loadLife();
            this.spawning = this.life.delay > 0;
            if (this.options.move.spin.enable) {
                const spinPos = (_h = this.options.move.spin.position) !== null && _h !== void 0 ? _h : { x: 50, y: 50 };
                const spinCenter = {
                    x: (spinPos.x / 100) * container.canvas.size.width,
                    y: (spinPos.y / 100) * container.canvas.size.height,
                };
                const pos = this.getPosition();
                const distance = (0, Utils$2.getDistance)(pos, spinCenter);
                this.spin = {
                    center: spinCenter,
                    direction: this.velocity.x >= 0 ? Enums$3.RotateDirection.clockwise : Enums$3.RotateDirection.counterClockwise,
                    angle: this.velocity.angle,
                    radius: distance,
                    acceleration: (_j = this.retina.spinAcceleration) !== null && _j !== void 0 ? _j : (0, Utils$2.getRangeValue)(this.options.move.spin.acceleration),
                };
            }
            this.shadowColor = (0, Utils$2.colorToRgb)(this.options.shadow.color);
            for (const updater of container.particles.updaters) {
                if (updater.init) {
                    updater.init(this);
                }
            }
            if (drawer && drawer.particleInit) {
                drawer.particleInit(container, this);
            }
            for (const [, plugin] of container.plugins) {
                if (plugin.particleCreated) {
                    plugin.particleCreated(this);
                }
            }
        }
        isVisible() {
            return !this.destroyed && !this.spawning && this.isInsideCanvas();
        }
        isInsideCanvas() {
            const radius = this.getRadius();
            const canvasSize = this.container.canvas.size;
            return (this.position.x >= -radius &&
                this.position.y >= -radius &&
                this.position.y <= canvasSize.height + radius &&
                this.position.x <= canvasSize.width + radius);
        }
        draw(delta) {
            const container = this.container;
            for (const [, plugin] of container.plugins) {
                container.canvas.drawParticlePlugin(plugin, this, delta);
            }
            container.canvas.drawParticle(this, delta);
        }
        getPosition() {
            return {
                x: this.position.x + this.offset.x,
                y: this.position.y + this.offset.y,
                z: this.position.z,
            };
        }
        getRadius() {
            var _a;
            return (_a = this.bubble.radius) !== null && _a !== void 0 ? _a : this.size.value;
        }
        getMass() {
            return (this.getRadius() ** 2 * Math.PI) / 2;
        }
        getFillColor() {
            var _a, _b, _c;
            const color = (_a = this.bubble.color) !== null && _a !== void 0 ? _a : (0, Utils$2.getHslFromAnimation)(this.color);
            if (color && this.roll && (this.backColor || this.roll.alter)) {
                const rolled = Math.floor(((_c = (_b = this.roll) === null || _b === void 0 ? void 0 : _b.angle) !== null && _c !== void 0 ? _c : 0) / (Math.PI / 2)) % 2;
                if (rolled) {
                    if (this.backColor) {
                        return this.backColor;
                    }
                    if (this.roll.alter) {
                        return (0, Utils$2.alterHsl)(color, this.roll.alter.type, this.roll.alter.value);
                    }
                }
            }
            return color;
        }
        getStrokeColor() {
            var _a, _b;
            return (_b = (_a = this.bubble.color) !== null && _a !== void 0 ? _a : (0, Utils$2.getHslFromAnimation)(this.strokeColor)) !== null && _b !== void 0 ? _b : this.getFillColor();
        }
        destroy(override) {
            this.destroyed = true;
            this.bubble.inRange = false;
            if (this.unbreakable) {
                return;
            }
            this.destroyed = true;
            this.bubble.inRange = false;
            for (const [, plugin] of this.container.plugins) {
                if (plugin.particleDestroyed) {
                    plugin.particleDestroyed(this, override);
                }
            }
            if (override) {
                return;
            }
            const destroyOptions = this.options.destroy;
            if (destroyOptions.mode === Enums$3.DestroyMode.split) {
                this.split();
            }
        }
        reset() {
            if (this.opacity) {
                this.opacity.loops = 0;
            }
            this.size.loops = 0;
        }
        split() {
            const splitOptions = this.options.destroy.split;
            if (splitOptions.count >= 0 && this.splitCount++ > splitOptions.count) {
                return;
            }
            const rate = (0, Utils$2.getRangeValue)(splitOptions.rate.value);
            for (let i = 0; i < rate; i++) {
                this.container.particles.addSplitParticle(this);
            }
        }
        calcPosition(container, position, zIndex, tryCount = 0) {
            var _a, _b, _c, _d, _e, _f;
            for (const [, plugin] of container.plugins) {
                const pluginPos = plugin.particlePosition !== undefined ? plugin.particlePosition(position, this) : undefined;
                if (pluginPos !== undefined) {
                    return Vector3d_1.Vector3d.create(pluginPos.x, pluginPos.y, zIndex);
                }
            }
            const canvasSize = container.canvas.size;
            const pos = Vector3d_1.Vector3d.create((_a = position === null || position === void 0 ? void 0 : position.x) !== null && _a !== void 0 ? _a : Math.random() * canvasSize.width, (_b = position === null || position === void 0 ? void 0 : position.y) !== null && _b !== void 0 ? _b : Math.random() * canvasSize.height, zIndex);
            const radius = this.getRadius();
            const outModes = this.options.move.outModes, fixHorizontal = (outMode) => {
                fixOutMode({
                    outMode,
                    checkModes: [Enums$3.OutMode.bounce, Enums$3.OutMode.bounceHorizontal],
                    coord: pos.x,
                    maxCoord: container.canvas.size.width,
                    setCb: (value) => (pos.x += value),
                    radius,
                });
            }, fixVertical = (outMode) => {
                fixOutMode({
                    outMode,
                    checkModes: [Enums$3.OutMode.bounce, Enums$3.OutMode.bounceVertical],
                    coord: pos.y,
                    maxCoord: container.canvas.size.height,
                    setCb: (value) => (pos.y += value),
                    radius,
                });
            };
            fixHorizontal((_c = outModes.left) !== null && _c !== void 0 ? _c : outModes.default);
            fixHorizontal((_d = outModes.right) !== null && _d !== void 0 ? _d : outModes.default);
            fixVertical((_e = outModes.top) !== null && _e !== void 0 ? _e : outModes.default);
            fixVertical((_f = outModes.bottom) !== null && _f !== void 0 ? _f : outModes.default);
            if (this.checkOverlap(pos, tryCount)) {
                return this.calcPosition(container, undefined, zIndex, tryCount + 1);
            }
            return pos;
        }
        checkOverlap(pos, tryCount = 0) {
            const collisionsOptions = this.options.collisions;
            const radius = this.getRadius();
            if (!collisionsOptions.enable) {
                return false;
            }
            const overlapOptions = collisionsOptions.overlap;
            if (overlapOptions.enable) {
                return false;
            }
            const retries = overlapOptions.retries;
            if (retries >= 0 && tryCount > retries) {
                throw new Error("Particle is overlapping and can't be placed");
            }
            let overlaps = false;
            for (const particle of this.container.particles.array) {
                if ((0, Utils$2.getDistance)(pos, particle.position) < radius + particle.getRadius()) {
                    overlaps = true;
                    break;
                }
            }
            return overlaps;
        }
        calculateVelocity() {
            const baseVelocity = (0, Utils$2.getParticleBaseVelocity)(this.direction);
            const res = baseVelocity.copy();
            const moveOptions = this.options.move;
            const rad = (Math.PI / 180) * moveOptions.angle.value;
            const radOffset = (Math.PI / 180) * moveOptions.angle.offset;
            const range = {
                left: radOffset - rad / 2,
                right: radOffset + rad / 2,
            };
            if (!moveOptions.straight) {
                res.angle += (0, Utils$2.randomInRange)((0, Utils$2.setRangeValue)(range.left, range.right));
            }
            if (moveOptions.random && typeof moveOptions.speed === "number") {
                res.length *= Math.random();
            }
            return res;
        }
        loadShapeData(shapeOptions, reduceDuplicates) {
            const shapeData = shapeOptions.options[this.shape];
            if (shapeData) {
                return (0, Utils$2.deepExtend)({}, shapeData instanceof Array ? (0, Utils$2.itemFromArray)(shapeData, this.id, reduceDuplicates) : shapeData);
            }
        }
        loadLife() {
            const container = this.container;
            const particlesOptions = this.options;
            const lifeOptions = particlesOptions.life;
            const life = {
                delay: container.retina.reduceFactor
                    ? (((0, Utils$2.getRangeValue)(lifeOptions.delay.value) * (lifeOptions.delay.sync ? 1 : Math.random())) /
                        container.retina.reduceFactor) *
                        1000
                    : 0,
                delayTime: 0,
                duration: container.retina.reduceFactor
                    ? (((0, Utils$2.getRangeValue)(lifeOptions.duration.value) * (lifeOptions.duration.sync ? 1 : Math.random())) /
                        container.retina.reduceFactor) *
                        1000
                    : 0,
                time: 0,
                count: particlesOptions.life.count,
            };
            if (life.duration <= 0) {
                life.duration = -1;
            }
            if (life.count <= 0) {
                life.count = -1;
            }
            return life;
        }
    }
    exports.Particle = Particle;
    });

    unwrapExports(Particle_1);
    Particle_1.Particle;

    var InteractionManager_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.InteractionManager = void 0;


    class InteractionManager {
        constructor(container) {
            this.container = container;
            this.externalInteractors = [];
            this.particleInteractors = [];
            this.init();
        }
        init() {
            const interactors = Utils$2.Plugins.getInteractors(this.container, true);
            for (const interactor of interactors) {
                switch (interactor.type) {
                    case Enums$3.InteractorType.External:
                        this.externalInteractors.push(interactor);
                        break;
                    case Enums$3.InteractorType.Particles:
                        this.particleInteractors.push(interactor);
                        break;
                }
            }
        }
        externalInteract(delta) {
            for (const interactor of this.externalInteractors) {
                if (interactor.isEnabled()) {
                    interactor.interact(delta);
                }
            }
        }
        particlesInteract(particle, delta) {
            for (const interactor of this.externalInteractors) {
                interactor.reset(particle);
            }
            for (const interactor of this.particleInteractors) {
                if (interactor.isEnabled(particle)) {
                    interactor.interact(particle, delta);
                }
            }
        }
    }
    exports.InteractionManager = InteractionManager;
    });

    unwrapExports(InteractionManager_1);
    InteractionManager_1.InteractionManager;

    var Mover_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Mover = void 0;


    function applyDistance(particle) {
        const initialPosition = particle.initialPosition;
        const { dx, dy } = (0, Utils$2.getDistances)(initialPosition, particle.position);
        const dxFixed = Math.abs(dx), dyFixed = Math.abs(dy);
        const hDistance = particle.retina.maxDistance.horizontal;
        const vDistance = particle.retina.maxDistance.vertical;
        if (!hDistance && !vDistance) {
            return;
        }
        if (((hDistance && dxFixed >= hDistance) || (vDistance && dyFixed >= vDistance)) && !particle.misplaced) {
            particle.misplaced = (!!hDistance && dxFixed > hDistance) || (!!vDistance && dyFixed > vDistance);
            if (hDistance) {
                particle.velocity.x = particle.velocity.y / 2 - particle.velocity.x;
            }
            if (vDistance) {
                particle.velocity.y = particle.velocity.x / 2 - particle.velocity.y;
            }
        }
        else if ((!hDistance || dxFixed < hDistance) && (!vDistance || dyFixed < vDistance) && particle.misplaced) {
            particle.misplaced = false;
        }
        else if (particle.misplaced) {
            const pos = particle.position, vel = particle.velocity;
            if (hDistance && ((pos.x < initialPosition.x && vel.x < 0) || (pos.x > initialPosition.x && vel.x > 0))) {
                vel.x *= -Math.random();
            }
            if (vDistance && ((pos.y < initialPosition.y && vel.y < 0) || (pos.y > initialPosition.y && vel.y > 0))) {
                vel.y *= -Math.random();
            }
        }
    }
    class Mover {
        constructor(container) {
            this.container = container;
        }
        move(particle, delta) {
            if (particle.destroyed) {
                return;
            }
            this.moveParticle(particle, delta);
            this.moveParallax(particle);
        }
        moveParticle(particle, delta) {
            var _a, _b, _c;
            var _d, _e;
            const particleOptions = particle.options;
            const moveOptions = particleOptions.move;
            if (!moveOptions.enable) {
                return;
            }
            const container = this.container, slowFactor = this.getProximitySpeedFactor(particle), baseSpeed = ((_a = (_d = particle.retina).moveSpeed) !== null && _a !== void 0 ? _a : (_d.moveSpeed = (0, Utils$2.getRangeValue)(moveOptions.speed) * container.retina.pixelRatio)) *
                container.retina.reduceFactor, moveDrift = ((_b = (_e = particle.retina).moveDrift) !== null && _b !== void 0 ? _b : (_e.moveDrift = (0, Utils$2.getRangeValue)(particle.options.move.drift) * container.retina.pixelRatio)), maxSize = (0, Utils$2.getRangeMax)(particleOptions.size.value) * container.retina.pixelRatio, sizeFactor = moveOptions.size ? particle.getRadius() / maxSize : 1, diffFactor = 2, speedFactor = (sizeFactor * slowFactor * (delta.factor || 1)) / diffFactor, moveSpeed = baseSpeed * speedFactor;
            this.applyPath(particle, delta);
            const gravityOptions = moveOptions.gravity;
            const gravityFactor = gravityOptions.enable && gravityOptions.inverse ? -1 : 1;
            if (gravityOptions.enable && moveSpeed) {
                particle.velocity.y += (gravityFactor * (gravityOptions.acceleration * delta.factor)) / (60 * moveSpeed);
            }
            if (moveDrift && moveSpeed) {
                particle.velocity.x += (moveDrift * delta.factor) / (60 * moveSpeed);
            }
            const decay = particle.moveDecay;
            if (decay != 1) {
                particle.velocity.multTo(decay);
            }
            const velocity = particle.velocity.mult(moveSpeed);
            const maxSpeed = (_c = particle.retina.maxSpeed) !== null && _c !== void 0 ? _c : container.retina.maxSpeed;
            if (gravityOptions.enable &&
                gravityOptions.maxSpeed > 0 &&
                ((!gravityOptions.inverse && velocity.y >= 0 && velocity.y >= maxSpeed) ||
                    (gravityOptions.inverse && velocity.y <= 0 && velocity.y <= -maxSpeed))) {
                velocity.y = gravityFactor * maxSpeed;
                if (moveSpeed) {
                    particle.velocity.y = velocity.y / moveSpeed;
                }
            }
            const zIndexOptions = particle.options.zIndex, zVelocityFactor = (1 - particle.zIndexFactor) ** zIndexOptions.velocityRate;
            if (moveOptions.spin.enable) {
                this.spin(particle, moveSpeed);
            }
            else {
                if (zVelocityFactor != 1) {
                    velocity.multTo(zVelocityFactor);
                }
                particle.position.addTo(velocity);
                if (moveOptions.vibrate) {
                    particle.position.x += Math.sin(particle.position.x * Math.cos(particle.position.y));
                    particle.position.y += Math.cos(particle.position.y * Math.sin(particle.position.x));
                }
            }
            applyDistance(particle);
        }
        spin(particle, moveSpeed) {
            const container = this.container;
            if (!particle.spin) {
                return;
            }
            const updateFunc = {
                x: particle.spin.direction === Enums$3.RotateDirection.clockwise ? Math.cos : Math.sin,
                y: particle.spin.direction === Enums$3.RotateDirection.clockwise ? Math.sin : Math.cos,
            };
            particle.position.x = particle.spin.center.x + particle.spin.radius * updateFunc.x(particle.spin.angle);
            particle.position.y = particle.spin.center.y + particle.spin.radius * updateFunc.y(particle.spin.angle);
            particle.spin.radius += particle.spin.acceleration;
            const maxCanvasSize = Math.max(container.canvas.size.width, container.canvas.size.height);
            if (particle.spin.radius > maxCanvasSize / 2) {
                particle.spin.radius = maxCanvasSize / 2;
                particle.spin.acceleration *= -1;
            }
            else if (particle.spin.radius < 0) {
                particle.spin.radius = 0;
                particle.spin.acceleration *= -1;
            }
            particle.spin.angle += (moveSpeed / 100) * (1 - particle.spin.radius / maxCanvasSize);
        }
        applyPath(particle, delta) {
            const particlesOptions = particle.options;
            const pathOptions = particlesOptions.move.path;
            const pathEnabled = pathOptions.enable;
            if (!pathEnabled) {
                return;
            }
            const container = this.container;
            if (particle.lastPathTime <= particle.pathDelay) {
                particle.lastPathTime += delta.value;
                return;
            }
            const path = container.pathGenerator.generate(particle);
            particle.velocity.addTo(path);
            if (pathOptions.clamp) {
                particle.velocity.x = (0, Utils$2.clamp)(particle.velocity.x, -1, 1);
                particle.velocity.y = (0, Utils$2.clamp)(particle.velocity.y, -1, 1);
            }
            particle.lastPathTime -= particle.pathDelay;
        }
        moveParallax(particle) {
            const container = this.container;
            const options = container.actualOptions;
            if ((0, Utils$2.isSsr)() || !options.interactivity.events.onHover.parallax.enable) {
                return;
            }
            const parallaxForce = options.interactivity.events.onHover.parallax.force;
            const mousePos = container.interactivity.mouse.position;
            if (!mousePos) {
                return;
            }
            const canvasCenter = {
                x: container.canvas.size.width / 2,
                y: container.canvas.size.height / 2,
            };
            const parallaxSmooth = options.interactivity.events.onHover.parallax.smooth;
            const factor = particle.getRadius() / parallaxForce;
            const tmp = {
                x: (mousePos.x - canvasCenter.x) * factor,
                y: (mousePos.y - canvasCenter.y) * factor,
            };
            particle.offset.x += (tmp.x - particle.offset.x) / parallaxSmooth;
            particle.offset.y += (tmp.y - particle.offset.y) / parallaxSmooth;
        }
        getProximitySpeedFactor(particle) {
            const container = this.container;
            const options = container.actualOptions;
            const active = (0, Utils$2.isInArray)(Enums$3.HoverMode.slow, options.interactivity.events.onHover.mode);
            if (!active) {
                return 1;
            }
            const mousePos = this.container.interactivity.mouse.position;
            if (!mousePos) {
                return 1;
            }
            const particlePos = particle.getPosition();
            const dist = (0, Utils$2.getDistance)(mousePos, particlePos);
            const radius = container.retina.slowModeRadius;
            if (dist > radius) {
                return 1;
            }
            const proximityFactor = dist / radius || 0;
            const slowFactor = options.interactivity.modes.slow.factor;
            return proximityFactor / slowFactor;
        }
    }
    exports.Mover = Mover;
    });

    unwrapExports(Mover_1);
    Mover_1.Mover;

    var Particles_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Particles = void 0;





    class Particles {
        constructor(container) {
            this.container = container;
            this.nextId = 0;
            this.array = [];
            this.zArray = [];
            this.mover = new Mover_1.Mover(container);
            this.limit = 0;
            this.needsSort = false;
            this.lastZIndex = 0;
            this.freqs = {
                links: new Map(),
                triangles: new Map(),
            };
            this.interactionManager = new InteractionManager_1.InteractionManager(container);
            const canvasSize = this.container.canvas.size;
            this.linksColors = new Map();
            this.quadTree = new Utils$2.QuadTree(new Utils$2.Rectangle(-canvasSize.width / 4, -canvasSize.height / 4, (canvasSize.width * 3) / 2, (canvasSize.height * 3) / 2), 4);
            this.updaters = Utils$2.Plugins.getUpdaters(container, true);
        }
        get count() {
            return this.array.length;
        }
        init() {
            var _a;
            const container = this.container;
            const options = container.actualOptions;
            this.lastZIndex = 0;
            this.needsSort = false;
            this.freqs.links = new Map();
            this.freqs.triangles = new Map();
            let handled = false;
            this.updaters = Utils$2.Plugins.getUpdaters(container, true);
            this.interactionManager.init();
            for (const [, plugin] of container.plugins) {
                if (plugin.particlesInitialization !== undefined) {
                    handled = plugin.particlesInitialization();
                }
                if (handled) {
                    break;
                }
            }
            this.addManualParticles();
            if (!handled) {
                for (const group in options.particles.groups) {
                    const groupOptions = options.particles.groups[group];
                    for (let i = this.count, j = 0; j < ((_a = groupOptions.number) === null || _a === void 0 ? void 0 : _a.value) && i < options.particles.number.value; i++, j++) {
                        this.addParticle(undefined, groupOptions, group);
                    }
                }
                for (let i = this.count; i < options.particles.number.value; i++) {
                    this.addParticle();
                }
            }
            container.pathGenerator.init(container);
        }
        redraw() {
            this.clear();
            this.init();
            this.draw({ value: 0, factor: 0 });
        }
        removeAt(index, quantity = 1, group, override) {
            if (!(index >= 0 && index <= this.count)) {
                return;
            }
            let deleted = 0;
            for (let i = index; deleted < quantity && i < this.count; i++) {
                const particle = this.array[i];
                if (!particle || particle.group !== group) {
                    continue;
                }
                particle.destroy(override);
                this.array.splice(i--, 1);
                const zIdx = this.zArray.indexOf(particle);
                this.zArray.splice(zIdx, 1);
                deleted++;
            }
        }
        remove(particle, group, override) {
            this.removeAt(this.array.indexOf(particle), undefined, group, override);
        }
        update(delta) {
            const container = this.container;
            const particlesToDelete = [];
            container.pathGenerator.update();
            for (const [, plugin] of container.plugins) {
                if (plugin.update !== undefined) {
                    plugin.update(delta);
                }
            }
            for (const particle of this.array) {
                const resizeFactor = container.canvas.resizeFactor;
                if (resizeFactor) {
                    particle.position.x *= resizeFactor.width;
                    particle.position.y *= resizeFactor.height;
                }
                particle.bubble.inRange = false;
                for (const [, plugin] of this.container.plugins) {
                    if (particle.destroyed) {
                        break;
                    }
                    if (plugin.particleUpdate) {
                        plugin.particleUpdate(particle, delta);
                    }
                }
                this.mover.move(particle, delta);
                if (particle.destroyed) {
                    particlesToDelete.push(particle);
                    continue;
                }
                this.quadTree.insert(new Utils$2.Point(particle.getPosition(), particle));
            }
            for (const particle of particlesToDelete) {
                this.remove(particle);
            }
            this.interactionManager.externalInteract(delta);
            for (const particle of container.particles.array) {
                for (const updater of this.updaters) {
                    updater.update(particle, delta);
                }
                if (!particle.destroyed && !particle.spawning) {
                    this.interactionManager.particlesInteract(particle, delta);
                }
            }
            delete container.canvas.resizeFactor;
        }
        draw(delta) {
            const container = this.container;
            container.canvas.clear();
            const canvasSize = this.container.canvas.size;
            this.quadTree = new Utils$2.QuadTree(new Utils$2.Rectangle(-canvasSize.width / 4, -canvasSize.height / 4, (canvasSize.width * 3) / 2, (canvasSize.height * 3) / 2), 4);
            this.update(delta);
            if (this.needsSort) {
                this.zArray.sort((a, b) => b.position.z - a.position.z || a.id - b.id);
                this.lastZIndex = this.zArray[this.zArray.length - 1].position.z;
                this.needsSort = false;
            }
            for (const [, plugin] of container.plugins) {
                container.canvas.drawPlugin(plugin, delta);
            }
            for (const p of this.zArray) {
                p.draw(delta);
            }
        }
        clear() {
            this.array = [];
            this.zArray = [];
        }
        push(nb, mouse, overrideOptions, group) {
            this.pushing = true;
            for (let i = 0; i < nb; i++) {
                this.addParticle(mouse === null || mouse === void 0 ? void 0 : mouse.position, overrideOptions, group);
            }
            this.pushing = false;
        }
        addParticle(position, overrideOptions, group) {
            const container = this.container;
            const options = container.actualOptions;
            const limit = options.particles.number.limit * container.density;
            if (limit > 0) {
                const countToRemove = this.count + 1 - limit;
                if (countToRemove > 0) {
                    this.removeQuantity(countToRemove);
                }
            }
            return this.pushParticle(position, overrideOptions, group);
        }
        addSplitParticle(parent) {
            const splitOptions = parent.options.destroy.split;
            const options = new ParticlesOptions_1.ParticlesOptions();
            options.load(parent.options);
            const factor = (0, Utils$2.getRangeValue)(splitOptions.factor.value);
            options.color.load({
                value: {
                    hsl: parent.getFillColor(),
                },
            });
            if (typeof options.size.value === "number") {
                options.size.value /= factor;
            }
            else {
                options.size.value.min /= factor;
                options.size.value.max /= factor;
            }
            options.load(splitOptions.particles);
            const offset = splitOptions.sizeOffset ? (0, Utils$2.setRangeValue)(-parent.size.value, parent.size.value) : 0;
            const position = {
                x: parent.position.x + (0, Utils$2.randomInRange)(offset),
                y: parent.position.y + (0, Utils$2.randomInRange)(offset),
            };
            return this.pushParticle(position, options, parent.group, (particle) => {
                if (particle.size.value < 0.5) {
                    return false;
                }
                particle.velocity.length = (0, Utils$2.randomInRange)((0, Utils$2.setRangeValue)(parent.velocity.length, particle.velocity.length));
                particle.splitCount = parent.splitCount + 1;
                particle.unbreakable = true;
                setTimeout(() => {
                    particle.unbreakable = false;
                }, 500);
                return true;
            });
        }
        removeQuantity(quantity, group) {
            this.removeAt(0, quantity, group);
        }
        getLinkFrequency(p1, p2) {
            const key = `${Math.min(p1.id, p2.id)}_${Math.max(p1.id, p2.id)}`;
            let res = this.freqs.links.get(key);
            if (res === undefined) {
                res = Math.random();
                this.freqs.links.set(key, res);
            }
            return res;
        }
        getTriangleFrequency(p1, p2, p3) {
            let [id1, id2, id3] = [p1.id, p2.id, p3.id];
            if (id1 > id2) {
                [id2, id1] = [id1, id2];
            }
            if (id2 > id3) {
                [id3, id2] = [id2, id3];
            }
            if (id1 > id3) {
                [id3, id1] = [id1, id3];
            }
            const key = `${id1}_${id2}_${id3}`;
            let res = this.freqs.triangles.get(key);
            if (res === undefined) {
                res = Math.random();
                this.freqs.triangles.set(key, res);
            }
            return res;
        }
        addManualParticles() {
            const container = this.container;
            const options = container.actualOptions;
            for (const particle of options.manualParticles) {
                const pos = particle.position
                    ? {
                        x: (particle.position.x * container.canvas.size.width) / 100,
                        y: (particle.position.y * container.canvas.size.height) / 100,
                    }
                    : undefined;
                this.addParticle(pos, particle.options);
            }
        }
        setDensity() {
            const options = this.container.actualOptions;
            for (const group in options.particles.groups) {
                this.applyDensity(options.particles.groups[group], 0, group);
            }
            this.applyDensity(options.particles, options.manualParticles.length);
        }
        applyDensity(options, manualCount, group) {
            var _a;
            if (!((_a = options.number.density) === null || _a === void 0 ? void 0 : _a.enable)) {
                return;
            }
            const numberOptions = options.number;
            const densityFactor = this.initDensityFactor(numberOptions.density);
            const optParticlesNumber = numberOptions.value;
            const optParticlesLimit = numberOptions.limit > 0 ? numberOptions.limit : optParticlesNumber;
            const particlesNumber = Math.min(optParticlesNumber, optParticlesLimit) * densityFactor + manualCount;
            const particlesCount = Math.min(this.count, this.array.filter((t) => t.group === group).length);
            this.limit = numberOptions.limit * densityFactor;
            if (particlesCount < particlesNumber) {
                this.push(Math.abs(particlesNumber - particlesCount), undefined, options, group);
            }
            else if (particlesCount > particlesNumber) {
                this.removeQuantity(particlesCount - particlesNumber, group);
            }
        }
        initDensityFactor(densityOptions) {
            const container = this.container;
            if (!container.canvas.element || !densityOptions.enable) {
                return 1;
            }
            const canvas = container.canvas.element;
            const pxRatio = container.retina.pixelRatio;
            return (canvas.width * canvas.height) / (densityOptions.factor * pxRatio ** 2 * densityOptions.area);
        }
        pushParticle(position, overrideOptions, group, initializer) {
            try {
                const particle = new Particle_1.Particle(this.nextId, this.container, position, overrideOptions, group);
                let canAdd = true;
                if (initializer) {
                    canAdd = initializer(particle);
                }
                if (!canAdd) {
                    return;
                }
                this.array.push(particle);
                this.zArray.push(particle);
                this.nextId++;
                return particle;
            }
            catch (e) {
                console.warn(`error adding particle: ${e}`);
                return;
            }
        }
    }
    exports.Particles = Particles;
    });

    unwrapExports(Particles_1);
    Particles_1.Particles;

    var Retina_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Retina = void 0;

    class Retina {
        constructor(container) {
            this.container = container;
        }
        init() {
            const container = this.container;
            const options = container.actualOptions;
            this.pixelRatio = !options.detectRetina || (0, Utils$2.isSsr)() ? 1 : window.devicePixelRatio;
            const motionOptions = this.container.actualOptions.motion;
            if (motionOptions && (motionOptions.disable || motionOptions.reduce.value)) {
                if ((0, Utils$2.isSsr)() || typeof matchMedia === "undefined" || !matchMedia) {
                    this.reduceFactor = 1;
                }
                else {
                    const mediaQuery = matchMedia("(prefers-reduced-motion: reduce)");
                    if (mediaQuery) {
                        this.handleMotionChange(mediaQuery);
                        const handleChange = () => {
                            this.handleMotionChange(mediaQuery);
                            container.refresh().catch(() => {
                            });
                        };
                        if (mediaQuery.addEventListener !== undefined) {
                            mediaQuery.addEventListener("change", handleChange);
                        }
                        else if (mediaQuery.addListener !== undefined) {
                            mediaQuery.addListener(handleChange);
                        }
                    }
                }
            }
            else {
                this.reduceFactor = 1;
            }
            const ratio = this.pixelRatio;
            if (container.canvas.element) {
                const element = container.canvas.element;
                container.canvas.size.width = element.offsetWidth * ratio;
                container.canvas.size.height = element.offsetHeight * ratio;
            }
            const particles = options.particles;
            this.attractDistance = particles.move.attract.distance * ratio;
            this.linksDistance = particles.links.distance * ratio;
            this.linksWidth = particles.links.width * ratio;
            this.sizeAnimationSpeed = particles.size.animation.speed * ratio;
            this.maxSpeed = particles.move.gravity.maxSpeed * ratio;
            if (particles.orbit.radius !== undefined) {
                this.orbitRadius = particles.orbit.radius * this.container.retina.pixelRatio;
            }
            const modes = options.interactivity.modes;
            this.connectModeDistance = modes.connect.distance * ratio;
            this.connectModeRadius = modes.connect.radius * ratio;
            this.grabModeDistance = modes.grab.distance * ratio;
            this.repulseModeDistance = modes.repulse.distance * ratio;
            this.bounceModeDistance = modes.bounce.distance * ratio;
            this.attractModeDistance = modes.attract.distance * ratio;
            this.slowModeRadius = modes.slow.radius * ratio;
            this.bubbleModeDistance = modes.bubble.distance * ratio;
            if (modes.bubble.size) {
                this.bubbleModeSize = modes.bubble.size * ratio;
            }
        }
        initParticle(particle) {
            const options = particle.options;
            const ratio = this.pixelRatio;
            const moveDistance = options.move.distance;
            const props = particle.retina;
            props.attractDistance = options.move.attract.distance * ratio;
            props.linksDistance = options.links.distance * ratio;
            props.linksWidth = options.links.width * ratio;
            props.moveDrift = (0, Utils$2.getRangeValue)(options.move.drift) * ratio;
            props.moveSpeed = (0, Utils$2.getRangeValue)(options.move.speed) * ratio;
            props.sizeAnimationSpeed = options.size.animation.speed * ratio;
            if (particle.spin) {
                props.spinAcceleration = (0, Utils$2.getRangeValue)(options.move.spin.acceleration) * ratio;
            }
            const maxDistance = props.maxDistance;
            maxDistance.horizontal = moveDistance.horizontal !== undefined ? moveDistance.horizontal * ratio : undefined;
            maxDistance.vertical = moveDistance.vertical !== undefined ? moveDistance.vertical * ratio : undefined;
            props.maxSpeed = options.move.gravity.maxSpeed * ratio;
        }
        handleMotionChange(mediaQuery) {
            const options = this.container.actualOptions;
            if (mediaQuery.matches) {
                const motion = options.motion;
                this.reduceFactor = motion.disable ? 0 : motion.reduce.value ? 1 / motion.reduce.factor : 1;
            }
            else {
                this.reduceFactor = 1;
            }
        }
    }
    exports.Retina = Retina;
    });

    unwrapExports(Retina_1);
    Retina_1.Retina;

    var FrameManager_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.FrameManager = void 0;
    class FrameManager {
        constructor(container) {
            this.container = container;
        }
        nextFrame(timestamp) {
            var _a;
            try {
                const container = this.container;
                if (container.lastFrameTime !== undefined &&
                    timestamp < container.lastFrameTime + 1000 / container.fpsLimit) {
                    container.draw(false);
                    return;
                }
                (_a = container.lastFrameTime) !== null && _a !== void 0 ? _a : (container.lastFrameTime = timestamp);
                const deltaValue = timestamp - container.lastFrameTime;
                const delta = {
                    value: deltaValue,
                    factor: (60 * deltaValue) / 1000,
                };
                container.lifeTime += delta.value;
                container.lastFrameTime = timestamp;
                if (deltaValue > 1000) {
                    container.draw(false);
                    return;
                }
                container.particles.draw(delta);
                if (container.duration > 0 && container.lifeTime > container.duration) {
                    container.destroy();
                    return;
                }
                if (container.getAnimationStatus()) {
                    container.draw(false);
                }
            }
            catch (e) {
                console.error("tsParticles error in animation loop", e);
            }
        }
    }
    exports.FrameManager = FrameManager;
    });

    unwrapExports(FrameManager_1);
    FrameManager_1.FrameManager;

    var ClickEvent_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ClickEvent = void 0;
    class ClickEvent {
        constructor() {
            this.enable = false;
            this.mode = [];
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            if (data.mode !== undefined) {
                this.mode = data.mode;
            }
        }
    }
    exports.ClickEvent = ClickEvent;
    });

    unwrapExports(ClickEvent_1);
    ClickEvent_1.ClickEvent;

    var DivEvent_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DivEvent = void 0;

    class DivEvent {
        constructor() {
            this.selectors = [];
            this.enable = false;
            this.mode = [];
            this.type = Enums$3.DivType.circle;
        }
        get elementId() {
            return this.ids;
        }
        set elementId(value) {
            this.ids = value;
        }
        get el() {
            return this.elementId;
        }
        set el(value) {
            this.elementId = value;
        }
        get ids() {
            return this.selectors instanceof Array
                ? this.selectors.map((t) => t.replace("#", ""))
                : this.selectors.replace("#", "");
        }
        set ids(value) {
            this.selectors = value instanceof Array ? value.map((t) => `#${t}`) : `#${value}`;
        }
        load(data) {
            var _a, _b;
            if (data === undefined) {
                return;
            }
            const ids = (_b = (_a = data.ids) !== null && _a !== void 0 ? _a : data.elementId) !== null && _b !== void 0 ? _b : data.el;
            if (ids !== undefined) {
                this.ids = ids;
            }
            if (data.selectors !== undefined) {
                this.selectors = data.selectors;
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            if (data.mode !== undefined) {
                this.mode = data.mode;
            }
            if (data.type !== undefined) {
                this.type = data.type;
            }
        }
    }
    exports.DivEvent = DivEvent;
    });

    unwrapExports(DivEvent_1);
    DivEvent_1.DivEvent;

    var Parallax_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Parallax = void 0;
    class Parallax {
        constructor() {
            this.enable = false;
            this.force = 2;
            this.smooth = 10;
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            if (data.force !== undefined) {
                this.force = data.force;
            }
            if (data.smooth !== undefined) {
                this.smooth = data.smooth;
            }
        }
    }
    exports.Parallax = Parallax;
    });

    unwrapExports(Parallax_1);
    Parallax_1.Parallax;

    var HoverEvent_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.HoverEvent = void 0;

    class HoverEvent {
        constructor() {
            this.enable = false;
            this.mode = [];
            this.parallax = new Parallax_1.Parallax();
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            if (data.mode !== undefined) {
                this.mode = data.mode;
            }
            this.parallax.load(data.parallax);
        }
    }
    exports.HoverEvent = HoverEvent;
    });

    unwrapExports(HoverEvent_1);
    HoverEvent_1.HoverEvent;

    var Events_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Events = void 0;



    class Events {
        constructor() {
            this.onClick = new ClickEvent_1.ClickEvent();
            this.onDiv = new DivEvent_1.DivEvent();
            this.onHover = new HoverEvent_1.HoverEvent();
            this.resize = true;
        }
        get onclick() {
            return this.onClick;
        }
        set onclick(value) {
            this.onClick = value;
        }
        get ondiv() {
            return this.onDiv;
        }
        set ondiv(value) {
            this.onDiv = value;
        }
        get onhover() {
            return this.onHover;
        }
        set onhover(value) {
            this.onHover = value;
        }
        load(data) {
            var _a, _b, _c;
            if (data === undefined) {
                return;
            }
            this.onClick.load((_a = data.onClick) !== null && _a !== void 0 ? _a : data.onclick);
            const onDiv = (_b = data.onDiv) !== null && _b !== void 0 ? _b : data.ondiv;
            if (onDiv !== undefined) {
                if (onDiv instanceof Array) {
                    this.onDiv = onDiv.map((div) => {
                        const tmp = new DivEvent_1.DivEvent();
                        tmp.load(div);
                        return tmp;
                    });
                }
                else {
                    this.onDiv = new DivEvent_1.DivEvent();
                    this.onDiv.load(onDiv);
                }
            }
            this.onHover.load((_c = data.onHover) !== null && _c !== void 0 ? _c : data.onhover);
            if (data.resize !== undefined) {
                this.resize = data.resize;
            }
        }
    }
    exports.Events = Events;
    });

    unwrapExports(Events_1);
    Events_1.Events;

    var BubbleBase_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.BubbleBase = void 0;

    class BubbleBase {
        constructor() {
            this.distance = 200;
            this.duration = 0.4;
            this.mix = false;
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.distance !== undefined) {
                this.distance = data.distance;
            }
            if (data.duration !== undefined) {
                this.duration = data.duration;
            }
            if (data.mix !== undefined) {
                this.mix = data.mix;
            }
            if (data.opacity !== undefined) {
                this.opacity = data.opacity;
            }
            if (data.color !== undefined) {
                if (data.color instanceof Array) {
                    this.color = data.color.map((s) => OptionsColor_1.OptionsColor.create(undefined, s));
                }
                else {
                    if (this.color instanceof Array) {
                        this.color = new OptionsColor_1.OptionsColor();
                    }
                    this.color = OptionsColor_1.OptionsColor.create(this.color, data.color);
                }
            }
            if (data.size !== undefined) {
                this.size = data.size;
            }
        }
    }
    exports.BubbleBase = BubbleBase;
    });

    unwrapExports(BubbleBase_1);
    BubbleBase_1.BubbleBase;

    var BubbleDiv_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.BubbleDiv = void 0;

    class BubbleDiv extends BubbleBase_1.BubbleBase {
        constructor() {
            super();
            this.selectors = [];
        }
        get ids() {
            return this.selectors instanceof Array
                ? this.selectors.map((t) => t.replace("#", ""))
                : this.selectors.replace("#", "");
        }
        set ids(value) {
            this.selectors = value instanceof Array ? value.map((t) => `#${t}`) : `#${value}`;
        }
        load(data) {
            super.load(data);
            if (data === undefined) {
                return;
            }
            if (data.ids !== undefined) {
                this.ids = data.ids;
            }
            if (data.selectors !== undefined) {
                this.selectors = data.selectors;
            }
        }
    }
    exports.BubbleDiv = BubbleDiv;
    });

    unwrapExports(BubbleDiv_1);
    BubbleDiv_1.BubbleDiv;

    var Bubble_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Bubble = void 0;


    class Bubble extends BubbleBase_1.BubbleBase {
        load(data) {
            super.load(data);
            if (!(data !== undefined && data.divs !== undefined)) {
                return;
            }
            if (data.divs instanceof Array) {
                this.divs = data.divs.map((s) => {
                    const tmp = new BubbleDiv_1.BubbleDiv();
                    tmp.load(s);
                    return tmp;
                });
            }
            else {
                if (this.divs instanceof Array || !this.divs) {
                    this.divs = new BubbleDiv_1.BubbleDiv();
                }
                this.divs.load(data.divs);
            }
        }
    }
    exports.Bubble = Bubble;
    });

    unwrapExports(Bubble_1);
    Bubble_1.Bubble;

    var ConnectLinks_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ConnectLinks = void 0;
    class ConnectLinks {
        constructor() {
            this.opacity = 0.5;
        }
        load(data) {
            if (!(data !== undefined && data.opacity !== undefined)) {
                return;
            }
            this.opacity = data.opacity;
        }
    }
    exports.ConnectLinks = ConnectLinks;
    });

    unwrapExports(ConnectLinks_1);
    ConnectLinks_1.ConnectLinks;

    var Connect_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Connect = void 0;

    class Connect {
        constructor() {
            this.distance = 80;
            this.links = new ConnectLinks_1.ConnectLinks();
            this.radius = 60;
        }
        get line_linked() {
            return this.links;
        }
        set line_linked(value) {
            this.links = value;
        }
        get lineLinked() {
            return this.links;
        }
        set lineLinked(value) {
            this.links = value;
        }
        load(data) {
            var _a, _b;
            if (data === undefined) {
                return;
            }
            if (data.distance !== undefined) {
                this.distance = data.distance;
            }
            this.links.load((_b = (_a = data.links) !== null && _a !== void 0 ? _a : data.lineLinked) !== null && _b !== void 0 ? _b : data.line_linked);
            if (data.radius !== undefined) {
                this.radius = data.radius;
            }
        }
    }
    exports.Connect = Connect;
    });

    unwrapExports(Connect_1);
    Connect_1.Connect;

    var GrabLinks_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.GrabLinks = void 0;

    class GrabLinks {
        constructor() {
            this.blink = false;
            this.consent = false;
            this.opacity = 1;
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.blink !== undefined) {
                this.blink = data.blink;
            }
            if (data.color !== undefined) {
                this.color = OptionsColor_1.OptionsColor.create(this.color, data.color);
            }
            if (data.consent !== undefined) {
                this.consent = data.consent;
            }
            if (data.opacity !== undefined) {
                this.opacity = data.opacity;
            }
        }
    }
    exports.GrabLinks = GrabLinks;
    });

    unwrapExports(GrabLinks_1);
    GrabLinks_1.GrabLinks;

    var Grab_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Grab = void 0;

    class Grab {
        constructor() {
            this.distance = 100;
            this.links = new GrabLinks_1.GrabLinks();
        }
        get line_linked() {
            return this.links;
        }
        set line_linked(value) {
            this.links = value;
        }
        get lineLinked() {
            return this.links;
        }
        set lineLinked(value) {
            this.links = value;
        }
        load(data) {
            var _a, _b;
            if (data === undefined) {
                return;
            }
            if (data.distance !== undefined) {
                this.distance = data.distance;
            }
            this.links.load((_b = (_a = data.links) !== null && _a !== void 0 ? _a : data.lineLinked) !== null && _b !== void 0 ? _b : data.line_linked);
        }
    }
    exports.Grab = Grab;
    });

    unwrapExports(Grab_1);
    Grab_1.Grab;

    var Remove_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Remove = void 0;
    class Remove {
        constructor() {
            this.quantity = 2;
        }
        get particles_nb() {
            return this.quantity;
        }
        set particles_nb(value) {
            this.quantity = value;
        }
        load(data) {
            var _a;
            if (data === undefined) {
                return;
            }
            const quantity = (_a = data.quantity) !== null && _a !== void 0 ? _a : data.particles_nb;
            if (quantity !== undefined) {
                this.quantity = quantity;
            }
        }
    }
    exports.Remove = Remove;
    });

    unwrapExports(Remove_1);
    Remove_1.Remove;

    var Push_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Push = void 0;
    class Push {
        constructor() {
            this.default = true;
            this.groups = [];
            this.quantity = 4;
        }
        get particles_nb() {
            return this.quantity;
        }
        set particles_nb(value) {
            this.quantity = value;
        }
        load(data) {
            var _a;
            if (data === undefined) {
                return;
            }
            if (data.default !== undefined) {
                this.default = data.default;
            }
            if (data.groups !== undefined) {
                this.groups = data.groups.map((t) => t);
            }
            if (!this.groups.length) {
                this.default = true;
            }
            const quantity = (_a = data.quantity) !== null && _a !== void 0 ? _a : data.particles_nb;
            if (quantity !== undefined) {
                this.quantity = quantity;
            }
        }
    }
    exports.Push = Push;
    });

    unwrapExports(Push_1);
    Push_1.Push;

    var RepulseBase_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.RepulseBase = void 0;

    class RepulseBase {
        constructor() {
            this.distance = 200;
            this.duration = 0.4;
            this.factor = 100;
            this.speed = 1;
            this.maxSpeed = 50;
            this.easing = Enums$3.EasingType.easeOutQuad;
        }
        load(data) {
            if (!data) {
                return;
            }
            if (data.distance !== undefined) {
                this.distance = data.distance;
            }
            if (data.duration !== undefined) {
                this.duration = data.duration;
            }
            if (data.easing !== undefined) {
                this.easing = data.easing;
            }
            if (data.factor !== undefined) {
                this.factor = data.factor;
            }
            if (data.speed !== undefined) {
                this.speed = data.speed;
            }
            if (data.maxSpeed !== undefined) {
                this.maxSpeed = data.maxSpeed;
            }
        }
    }
    exports.RepulseBase = RepulseBase;
    });

    unwrapExports(RepulseBase_1);
    RepulseBase_1.RepulseBase;

    var RepulseDiv_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.RepulseDiv = void 0;

    class RepulseDiv extends RepulseBase_1.RepulseBase {
        constructor() {
            super();
            this.selectors = [];
        }
        get ids() {
            if (this.selectors instanceof Array) {
                return this.selectors.map((t) => t.replace("#", ""));
            }
            else {
                return this.selectors.replace("#", "");
            }
        }
        set ids(value) {
            if (value instanceof Array) {
                this.selectors = value.map(() => `#${value}`);
            }
            else {
                this.selectors = `#${value}`;
            }
        }
        load(data) {
            super.load(data);
            if (data === undefined) {
                return;
            }
            if (data.ids !== undefined) {
                this.ids = data.ids;
            }
            if (data.selectors !== undefined) {
                this.selectors = data.selectors;
            }
        }
    }
    exports.RepulseDiv = RepulseDiv;
    });

    unwrapExports(RepulseDiv_1);
    RepulseDiv_1.RepulseDiv;

    var Repulse_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Repulse = void 0;


    class Repulse extends RepulseBase_1.RepulseBase {
        load(data) {
            super.load(data);
            if ((data === null || data === void 0 ? void 0 : data.divs) === undefined) {
                return;
            }
            if (data.divs instanceof Array) {
                this.divs = data.divs.map((s) => {
                    const tmp = new RepulseDiv_1.RepulseDiv();
                    tmp.load(s);
                    return tmp;
                });
            }
            else {
                if (this.divs instanceof Array || !this.divs) {
                    this.divs = new RepulseDiv_1.RepulseDiv();
                }
                this.divs.load(data.divs);
            }
        }
    }
    exports.Repulse = Repulse;
    });

    unwrapExports(Repulse_1);
    Repulse_1.Repulse;

    var Slow_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Slow = void 0;
    class Slow {
        constructor() {
            this.factor = 3;
            this.radius = 200;
        }
        get active() {
            return false;
        }
        set active(_value) {
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.factor !== undefined) {
                this.factor = data.factor;
            }
            if (data.radius !== undefined) {
                this.radius = data.radius;
            }
        }
    }
    exports.Slow = Slow;
    });

    unwrapExports(Slow_1);
    Slow_1.Slow;

    var Trail_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Trail = void 0;

    class Trail {
        constructor() {
            this.delay = 1;
            this.pauseOnStop = false;
            this.quantity = 1;
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.delay !== undefined) {
                this.delay = data.delay;
            }
            if (data.quantity !== undefined) {
                this.quantity = data.quantity;
            }
            if (data.particles !== undefined) {
                this.particles = (0, Utils$2.deepExtend)({}, data.particles);
            }
            if (data.pauseOnStop !== undefined) {
                this.pauseOnStop = data.pauseOnStop;
            }
        }
    }
    exports.Trail = Trail;
    });

    unwrapExports(Trail_1);
    Trail_1.Trail;

    var Attract_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Attract = void 0;

    class Attract {
        constructor() {
            this.distance = 200;
            this.duration = 0.4;
            this.easing = Enums$3.EasingType.easeOutQuad;
            this.factor = 1;
            this.maxSpeed = 50;
            this.speed = 1;
        }
        load(data) {
            if (!data) {
                return;
            }
            if (data.distance !== undefined) {
                this.distance = data.distance;
            }
            if (data.duration !== undefined) {
                this.duration = data.duration;
            }
            if (data.easing !== undefined) {
                this.easing = data.easing;
            }
            if (data.factor !== undefined) {
                this.factor = data.factor;
            }
            if (data.maxSpeed !== undefined) {
                this.maxSpeed = data.maxSpeed;
            }
            if (data.speed !== undefined) {
                this.speed = data.speed;
            }
        }
    }
    exports.Attract = Attract;
    });

    unwrapExports(Attract_1);
    Attract_1.Attract;

    var LightGradient_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.LightGradient = void 0;

    class LightGradient {
        constructor() {
            this.start = new OptionsColor_1.OptionsColor();
            this.stop = new OptionsColor_1.OptionsColor();
            this.start.value = "#ffffff";
            this.stop.value = "#000000";
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            this.start = OptionsColor_1.OptionsColor.create(this.start, data.start);
            this.stop = OptionsColor_1.OptionsColor.create(this.stop, data.stop);
        }
    }
    exports.LightGradient = LightGradient;
    });

    unwrapExports(LightGradient_1);
    LightGradient_1.LightGradient;

    var LightArea_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.LightArea = void 0;

    class LightArea {
        constructor() {
            this.gradient = new LightGradient_1.LightGradient();
            this.radius = 1000;
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            this.gradient.load(data.gradient);
            if (data.radius !== undefined) {
                this.radius = data.radius;
            }
        }
    }
    exports.LightArea = LightArea;
    });

    unwrapExports(LightArea_1);
    LightArea_1.LightArea;

    var LightShadow_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.LightShadow = void 0;

    class LightShadow {
        constructor() {
            this.color = new OptionsColor_1.OptionsColor();
            this.color.value = "#000000";
            this.length = 2000;
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            this.color = OptionsColor_1.OptionsColor.create(this.color, data.color);
            if (data.length !== undefined) {
                this.length = data.length;
            }
        }
    }
    exports.LightShadow = LightShadow;
    });

    unwrapExports(LightShadow_1);
    LightShadow_1.LightShadow;

    var Light_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Light = void 0;


    class Light {
        constructor() {
            this.area = new LightArea_1.LightArea();
            this.shadow = new LightShadow_1.LightShadow();
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            this.area.load(data.area);
            this.shadow.load(data.shadow);
        }
    }
    exports.Light = Light;
    });

    unwrapExports(Light_1);
    Light_1.Light;

    var Bounce_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Bounce = void 0;
    class Bounce {
        constructor() {
            this.distance = 200;
        }
        load(data) {
            if (!data) {
                return;
            }
            if (data.distance !== undefined) {
                this.distance = data.distance;
            }
        }
    }
    exports.Bounce = Bounce;
    });

    unwrapExports(Bounce_1);
    Bounce_1.Bounce;

    var Modes_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Modes = void 0;











    class Modes {
        constructor() {
            this.attract = new Attract_1.Attract();
            this.bounce = new Bounce_1.Bounce();
            this.bubble = new Bubble_1.Bubble();
            this.connect = new Connect_1.Connect();
            this.grab = new Grab_1.Grab();
            this.light = new Light_1.Light();
            this.push = new Push_1.Push();
            this.remove = new Remove_1.Remove();
            this.repulse = new Repulse_1.Repulse();
            this.slow = new Slow_1.Slow();
            this.trail = new Trail_1.Trail();
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            this.attract.load(data.attract);
            this.bubble.load(data.bubble);
            this.connect.load(data.connect);
            this.grab.load(data.grab);
            this.light.load(data.light);
            this.push.load(data.push);
            this.remove.load(data.remove);
            this.repulse.load(data.repulse);
            this.slow.load(data.slow);
            this.trail.load(data.trail);
        }
    }
    exports.Modes = Modes;
    });

    unwrapExports(Modes_1);
    Modes_1.Modes;

    var Interactivity_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Interactivity = void 0;



    class Interactivity {
        constructor() {
            this.detectsOn = Enums$3.InteractivityDetect.window;
            this.events = new Events_1.Events();
            this.modes = new Modes_1.Modes();
        }
        get detect_on() {
            return this.detectsOn;
        }
        set detect_on(value) {
            this.detectsOn = value;
        }
        load(data) {
            var _a, _b, _c;
            if (data === undefined) {
                return;
            }
            const detectsOn = (_a = data.detectsOn) !== null && _a !== void 0 ? _a : data.detect_on;
            if (detectsOn !== undefined) {
                this.detectsOn = detectsOn;
            }
            this.events.load(data.events);
            this.modes.load(data.modes);
            if (((_c = (_b = data.modes) === null || _b === void 0 ? void 0 : _b.slow) === null || _c === void 0 ? void 0 : _c.active) === true) {
                if (this.events.onHover.mode instanceof Array) {
                    if (this.events.onHover.mode.indexOf(Enums$3.HoverMode.slow) < 0) {
                        this.events.onHover.mode.push(Enums$3.HoverMode.slow);
                    }
                }
                else if (this.events.onHover.mode !== Enums$3.HoverMode.slow) {
                    this.events.onHover.mode = [this.events.onHover.mode, Enums$3.HoverMode.slow];
                }
            }
        }
    }
    exports.Interactivity = Interactivity;
    });

    unwrapExports(Interactivity_1);
    Interactivity_1.Interactivity;

    var BackgroundMaskCover_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.BackgroundMaskCover = void 0;

    class BackgroundMaskCover {
        constructor() {
            this.color = new OptionsColor_1.OptionsColor();
            this.opacity = 1;
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.color !== undefined) {
                this.color = OptionsColor_1.OptionsColor.create(this.color, data.color);
            }
            if (data.opacity !== undefined) {
                this.opacity = data.opacity;
            }
        }
    }
    exports.BackgroundMaskCover = BackgroundMaskCover;
    });

    unwrapExports(BackgroundMaskCover_1);
    BackgroundMaskCover_1.BackgroundMaskCover;

    var BackgroundMask_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.BackgroundMask = void 0;

    class BackgroundMask {
        constructor() {
            this.composite = "destination-out";
            this.cover = new BackgroundMaskCover_1.BackgroundMaskCover();
            this.enable = false;
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.composite !== undefined) {
                this.composite = data.composite;
            }
            if (data.cover !== undefined) {
                const cover = data.cover;
                const color = (typeof data.cover === "string" ? { color: data.cover } : data.cover);
                this.cover.load(cover.color !== undefined ? cover : { color: color });
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
        }
    }
    exports.BackgroundMask = BackgroundMask;
    });

    unwrapExports(BackgroundMask_1);
    BackgroundMask_1.BackgroundMask;

    var Background_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Background = void 0;

    class Background {
        constructor() {
            this.color = new OptionsColor_1.OptionsColor();
            this.color.value = "";
            this.image = "";
            this.position = "";
            this.repeat = "";
            this.size = "";
            this.opacity = 1;
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.color !== undefined) {
                this.color = OptionsColor_1.OptionsColor.create(this.color, data.color);
            }
            if (data.image !== undefined) {
                this.image = data.image;
            }
            if (data.position !== undefined) {
                this.position = data.position;
            }
            if (data.repeat !== undefined) {
                this.repeat = data.repeat;
            }
            if (data.size !== undefined) {
                this.size = data.size;
            }
            if (data.opacity !== undefined) {
                this.opacity = data.opacity;
            }
        }
    }
    exports.Background = Background;
    });

    unwrapExports(Background_1);
    Background_1.Background;

    var ThemeDefault_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ThemeDefault = void 0;

    class ThemeDefault {
        constructor() {
            this.auto = false;
            this.mode = Enums$3.ThemeMode.any;
            this.value = false;
        }
        load(data) {
            if (!data) {
                return;
            }
            if (data.auto !== undefined) {
                this.auto = data.auto;
            }
            if (data.mode !== undefined) {
                this.mode = data.mode;
            }
            if (data.value !== undefined) {
                this.value = data.value;
            }
        }
    }
    exports.ThemeDefault = ThemeDefault;
    });

    unwrapExports(ThemeDefault_1);
    ThemeDefault_1.ThemeDefault;

    var Theme_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Theme = void 0;


    class Theme {
        constructor() {
            this.name = "";
            this.default = new ThemeDefault_1.ThemeDefault();
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.name !== undefined) {
                this.name = data.name;
            }
            this.default.load(data.default);
            if (data.options !== undefined) {
                this.options = (0, Utils$2.deepExtend)({}, data.options);
            }
        }
    }
    exports.Theme = Theme;
    });

    unwrapExports(Theme_1);
    Theme_1.Theme;

    var FullScreen_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.FullScreen = void 0;
    class FullScreen {
        constructor() {
            this.enable = true;
            this.zIndex = 0;
        }
        load(data) {
            if (!data) {
                return;
            }
            if (data.enable !== undefined) {
                this.enable = data.enable;
            }
            if (data.zIndex !== undefined) {
                this.zIndex = data.zIndex;
            }
        }
    }
    exports.FullScreen = FullScreen;
    });

    unwrapExports(FullScreen_1);
    FullScreen_1.FullScreen;

    var MotionReduce_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MotionReduce = void 0;
    class MotionReduce {
        constructor() {
            this.factor = 4;
            this.value = true;
        }
        load(data) {
            if (!data) {
                return;
            }
            if (data.factor !== undefined) {
                this.factor = data.factor;
            }
            if (data.value !== undefined) {
                this.value = data.value;
            }
        }
    }
    exports.MotionReduce = MotionReduce;
    });

    unwrapExports(MotionReduce_1);
    MotionReduce_1.MotionReduce;

    var Motion_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Motion = void 0;

    class Motion {
        constructor() {
            this.disable = false;
            this.reduce = new MotionReduce_1.MotionReduce();
        }
        load(data) {
            if (!data) {
                return;
            }
            if (data.disable !== undefined) {
                this.disable = data.disable;
            }
            this.reduce.load(data.reduce);
        }
    }
    exports.Motion = Motion;
    });

    unwrapExports(Motion_1);
    Motion_1.Motion;

    var ManualParticle_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ManualParticle = void 0;

    class ManualParticle {
        load(data) {
            var _a, _b;
            if (!data) {
                return;
            }
            if (data.position !== undefined) {
                this.position = {
                    x: (_a = data.position.x) !== null && _a !== void 0 ? _a : 50,
                    y: (_b = data.position.y) !== null && _b !== void 0 ? _b : 50,
                };
            }
            if (data.options !== undefined) {
                this.options = (0, Utils$2.deepExtend)({}, data.options);
            }
        }
    }
    exports.ManualParticle = ManualParticle;
    });

    unwrapExports(ManualParticle_1);
    ManualParticle_1.ManualParticle;

    var Responsive_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Responsive = void 0;


    class Responsive {
        constructor() {
            this.maxWidth = Infinity;
            this.options = {};
            this.mode = Enums$3.ResponsiveMode.canvas;
        }
        load(data) {
            if (!data) {
                return;
            }
            if (data.maxWidth !== undefined) {
                this.maxWidth = data.maxWidth;
            }
            if (data.mode !== undefined) {
                if (data.mode === Enums$3.ResponsiveMode.screen) {
                    this.mode = Enums$3.ResponsiveMode.screen;
                }
                else {
                    this.mode = Enums$3.ResponsiveMode.canvas;
                }
            }
            if (data.options !== undefined) {
                this.options = (0, Utils$2.deepExtend)({}, data.options);
            }
        }
    }
    exports.Responsive = Responsive;
    });

    unwrapExports(Responsive_1);
    Responsive_1.Responsive;

    var Options_1 = createCommonjsModule(function (module, exports) {
    var __classPrivateFieldGet = (commonjsGlobal && commonjsGlobal.__classPrivateFieldGet) || function (receiver, state, kind, f) {
        if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
        if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
        return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
    };
    var _Options_instances, _Options_findDefaultTheme;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Options = void 0;











    class Options {
        constructor() {
            _Options_instances.add(this);
            this.autoPlay = true;
            this.background = new Background_1.Background();
            this.backgroundMask = new BackgroundMask_1.BackgroundMask();
            this.fullScreen = new FullScreen_1.FullScreen();
            this.detectRetina = true;
            this.duration = 0;
            this.fpsLimit = 60;
            this.interactivity = new Interactivity_1.Interactivity();
            this.manualParticles = [];
            this.motion = new Motion_1.Motion();
            this.particles = new ParticlesOptions_1.ParticlesOptions();
            this.pauseOnBlur = true;
            this.pauseOnOutsideViewport = true;
            this.responsive = [];
            this.themes = [];
            this.zLayers = 100;
        }
        get fps_limit() {
            return this.fpsLimit;
        }
        set fps_limit(value) {
            this.fpsLimit = value;
        }
        get retina_detect() {
            return this.detectRetina;
        }
        set retina_detect(value) {
            this.detectRetina = value;
        }
        get backgroundMode() {
            return this.fullScreen;
        }
        set backgroundMode(value) {
            this.fullScreen.load(value);
        }
        load(data) {
            var _a, _b, _c, _d, _e;
            if (data === undefined) {
                return;
            }
            if (data.preset !== undefined) {
                if (data.preset instanceof Array) {
                    for (const preset of data.preset) {
                        this.importPreset(preset);
                    }
                }
                else {
                    this.importPreset(data.preset);
                }
            }
            if (data.autoPlay !== undefined) {
                this.autoPlay = data.autoPlay;
            }
            const detectRetina = (_a = data.detectRetina) !== null && _a !== void 0 ? _a : data.retina_detect;
            if (detectRetina !== undefined) {
                this.detectRetina = detectRetina;
            }
            if (data.duration !== undefined) {
                this.duration = data.duration;
            }
            const fpsLimit = (_b = data.fpsLimit) !== null && _b !== void 0 ? _b : data.fps_limit;
            if (fpsLimit !== undefined) {
                this.fpsLimit = fpsLimit;
            }
            if (data.pauseOnBlur !== undefined) {
                this.pauseOnBlur = data.pauseOnBlur;
            }
            if (data.pauseOnOutsideViewport !== undefined) {
                this.pauseOnOutsideViewport = data.pauseOnOutsideViewport;
            }
            if (data.zLayers !== undefined) {
                this.zLayers = data.zLayers;
            }
            this.background.load(data.background);
            const fullScreen = (_c = data.fullScreen) !== null && _c !== void 0 ? _c : data.backgroundMode;
            if (typeof fullScreen === "boolean") {
                this.fullScreen.enable = fullScreen;
            }
            else {
                this.fullScreen.load(fullScreen);
            }
            this.backgroundMask.load(data.backgroundMask);
            this.interactivity.load(data.interactivity);
            if (data.manualParticles !== undefined) {
                this.manualParticles = data.manualParticles.map((t) => {
                    const tmp = new ManualParticle_1.ManualParticle();
                    tmp.load(t);
                    return tmp;
                });
            }
            this.motion.load(data.motion);
            this.particles.load(data.particles);
            Utils$2.Plugins.loadOptions(this, data);
            if (data.responsive !== undefined) {
                for (const responsive of data.responsive) {
                    const optResponsive = new Responsive_1.Responsive();
                    optResponsive.load(responsive);
                    this.responsive.push(optResponsive);
                }
            }
            this.responsive.sort((a, b) => a.maxWidth - b.maxWidth);
            if (data.themes !== undefined) {
                for (const theme of data.themes) {
                    const optTheme = new Theme_1.Theme();
                    optTheme.load(theme);
                    this.themes.push(optTheme);
                }
            }
            this.defaultDarkTheme = (_d = __classPrivateFieldGet(this, _Options_instances, "m", _Options_findDefaultTheme).call(this, Enums$3.ThemeMode.dark)) === null || _d === void 0 ? void 0 : _d.name;
            this.defaultLightTheme = (_e = __classPrivateFieldGet(this, _Options_instances, "m", _Options_findDefaultTheme).call(this, Enums$3.ThemeMode.light)) === null || _e === void 0 ? void 0 : _e.name;
        }
        setTheme(name) {
            if (name) {
                const chosenTheme = this.themes.find((theme) => theme.name === name);
                if (chosenTheme) {
                    this.load(chosenTheme.options);
                }
            }
            else {
                const mediaMatch = typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)"), clientDarkMode = mediaMatch && mediaMatch.matches, defaultTheme = __classPrivateFieldGet(this, _Options_instances, "m", _Options_findDefaultTheme).call(this, clientDarkMode ? Enums$3.ThemeMode.dark : Enums$3.ThemeMode.light);
                if (defaultTheme) {
                    this.load(defaultTheme.options);
                }
            }
        }
        setResponsive(width, pxRatio, defaultOptions) {
            this.load(defaultOptions);
            const responsiveOptions = this.responsive.find((t) => t.mode === Enums$3.ResponsiveMode.screen && screen
                ? t.maxWidth * pxRatio > screen.availWidth
                : t.maxWidth * pxRatio > width);
            this.load(responsiveOptions === null || responsiveOptions === void 0 ? void 0 : responsiveOptions.options);
            return responsiveOptions === null || responsiveOptions === void 0 ? void 0 : responsiveOptions.maxWidth;
        }
        importPreset(preset) {
            this.load(Utils$2.Plugins.getPreset(preset));
        }
    }
    exports.Options = Options;
    _Options_instances = new WeakSet(), _Options_findDefaultTheme = function _Options_findDefaultTheme(mode) {
        var _a;
        return ((_a = this.themes.find((theme) => theme.default.value && theme.default.mode === mode)) !== null && _a !== void 0 ? _a : this.themes.find((theme) => theme.default.value && theme.default.mode === Enums$3.ThemeMode.any));
    };
    });

    unwrapExports(Options_1);
    Options_1.Options;

    var Container_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Container = void 0;







    class Container {
        constructor(id, sourceOptions, ...presets) {
            this.id = id;
            this.fpsLimit = 60;
            this.duration = 0;
            this.lifeTime = 0;
            this.firstStart = true;
            this.started = false;
            this.destroyed = false;
            this.paused = true;
            this.lastFrameTime = 0;
            this.zLayers = 100;
            this.pageHidden = false;
            this._sourceOptions = sourceOptions;
            this._initialSourceOptions = sourceOptions;
            this.retina = new Retina_1.Retina(this);
            this.canvas = new Canvas_1.Canvas(this);
            this.particles = new Particles_1.Particles(this);
            this.drawer = new FrameManager_1.FrameManager(this);
            this.presets = presets;
            this.pathGenerator = {
                generate: () => {
                    const v = Vector_1.Vector.create(0, 0);
                    v.length = Math.random();
                    v.angle = Math.random() * Math.PI * 2;
                    return v;
                },
                init: () => {
                },
                update: () => {
                },
            };
            this.interactivity = {
                mouse: {
                    clicking: false,
                    inside: false,
                },
            };
            this.bubble = {};
            this.repulse = { particles: [] };
            this.attract = { particles: [] };
            this.plugins = new Map();
            this.drawers = new Map();
            this.density = 1;
            this._options = new Options_1.Options();
            this.actualOptions = new Options_1.Options();
            this.eventListeners = new Utils$2.EventListeners(this);
            if (typeof IntersectionObserver !== "undefined" && IntersectionObserver) {
                this.intersectionObserver = new IntersectionObserver((entries) => this.intersectionManager(entries));
            }
        }
        get options() {
            return this._options;
        }
        get sourceOptions() {
            return this._sourceOptions;
        }
        play(force) {
            const needsUpdate = this.paused || force;
            if (this.firstStart && !this.actualOptions.autoPlay) {
                this.firstStart = false;
                return;
            }
            if (this.paused) {
                this.paused = false;
            }
            if (needsUpdate) {
                for (const [, plugin] of this.plugins) {
                    if (plugin.play) {
                        plugin.play();
                    }
                }
            }
            this.draw(needsUpdate || false);
        }
        pause() {
            if (this.drawAnimationFrame !== undefined) {
                (0, Utils$2.cancelAnimation)()(this.drawAnimationFrame);
                delete this.drawAnimationFrame;
            }
            if (this.paused) {
                return;
            }
            for (const [, plugin] of this.plugins) {
                if (plugin.pause) {
                    plugin.pause();
                }
            }
            if (!this.pageHidden) {
                this.paused = true;
            }
        }
        draw(force) {
            let refreshTime = force;
            this.drawAnimationFrame = (0, Utils$2.animate)()((timestamp) => {
                if (refreshTime) {
                    this.lastFrameTime = undefined;
                    refreshTime = false;
                }
                this.drawer.nextFrame(timestamp);
            });
        }
        getAnimationStatus() {
            return !this.paused && !this.pageHidden;
        }
        setNoise(noiseOrGenerator, init, update) {
            this.setPath(noiseOrGenerator, init, update);
        }
        setPath(pathOrGenerator, init, update) {
            if (!pathOrGenerator) {
                return;
            }
            if (typeof pathOrGenerator === "function") {
                this.pathGenerator.generate = pathOrGenerator;
                if (init) {
                    this.pathGenerator.init = init;
                }
                if (update) {
                    this.pathGenerator.update = update;
                }
            }
            else {
                if (pathOrGenerator.generate) {
                    this.pathGenerator.generate = pathOrGenerator.generate;
                }
                if (pathOrGenerator.init) {
                    this.pathGenerator.init = pathOrGenerator.init;
                }
                if (pathOrGenerator.update) {
                    this.pathGenerator.update = pathOrGenerator.update;
                }
            }
        }
        destroy() {
            this.stop();
            this.canvas.destroy();
            for (const [, drawer] of this.drawers) {
                if (drawer.destroy) {
                    drawer.destroy(this);
                }
            }
            for (const key of this.drawers.keys()) {
                this.drawers.delete(key);
            }
            this.destroyed = true;
        }
        exportImg(callback) {
            this.exportImage(callback);
        }
        exportImage(callback, type, quality) {
            var _a;
            return (_a = this.canvas.element) === null || _a === void 0 ? void 0 : _a.toBlob(callback, type !== null && type !== void 0 ? type : "image/png", quality);
        }
        exportConfiguration() {
            return JSON.stringify(this.actualOptions, undefined, 2);
        }
        refresh() {
            this.stop();
            return this.start();
        }
        reset() {
            this._options = new Options_1.Options();
            return this.refresh();
        }
        stop() {
            if (!this.started) {
                return;
            }
            this.firstStart = true;
            this.started = false;
            this.eventListeners.removeListeners();
            this.pause();
            this.particles.clear();
            this.canvas.clear();
            if (this.interactivity.element instanceof HTMLElement && this.intersectionObserver) {
                this.intersectionObserver.observe(this.interactivity.element);
            }
            for (const [, plugin] of this.plugins) {
                if (plugin.stop) {
                    plugin.stop();
                }
            }
            for (const key of this.plugins.keys()) {
                this.plugins.delete(key);
            }
            this.particles.linksColors = new Map();
            delete this.particles.grabLineColor;
            delete this.particles.linksColor;
            this._sourceOptions = this._options;
        }
        async loadTheme(name) {
            this.currentTheme = name;
            await this.refresh();
        }
        async start() {
            if (this.started) {
                return;
            }
            await this.init();
            this.started = true;
            this.eventListeners.addListeners();
            if (this.interactivity.element instanceof HTMLElement && this.intersectionObserver) {
                this.intersectionObserver.observe(this.interactivity.element);
            }
            for (const [, plugin] of this.plugins) {
                if (plugin.startAsync !== undefined) {
                    await plugin.startAsync();
                }
                else if (plugin.start !== undefined) {
                    plugin.start();
                }
            }
            this.play();
        }
        addClickHandler(callback) {
            const el = this.interactivity.element;
            if (!el) {
                return;
            }
            const clickOrTouchHandler = (e, pos, radius) => {
                if (this.destroyed) {
                    return;
                }
                const pxRatio = this.retina.pixelRatio, posRetina = {
                    x: pos.x * pxRatio,
                    y: pos.y * pxRatio,
                }, particles = this.particles.quadTree.queryCircle(posRetina, radius * pxRatio);
                callback(e, particles);
            };
            const clickHandler = (e) => {
                if (this.destroyed) {
                    return;
                }
                const mouseEvent = e;
                const pos = {
                    x: mouseEvent.offsetX || mouseEvent.clientX,
                    y: mouseEvent.offsetY || mouseEvent.clientY,
                };
                clickOrTouchHandler(e, pos, 1);
            };
            const touchStartHandler = () => {
                if (this.destroyed) {
                    return;
                }
                touched = true;
                touchMoved = false;
            };
            const touchMoveHandler = () => {
                if (this.destroyed) {
                    return;
                }
                touchMoved = true;
            };
            const touchEndHandler = (e) => {
                var _a, _b, _c;
                if (this.destroyed) {
                    return;
                }
                if (touched && !touchMoved) {
                    const touchEvent = e;
                    let lastTouch = touchEvent.touches[touchEvent.touches.length - 1];
                    if (!lastTouch) {
                        lastTouch = touchEvent.changedTouches[touchEvent.changedTouches.length - 1];
                        if (!lastTouch) {
                            return;
                        }
                    }
                    const canvasRect = (_a = this.canvas.element) === null || _a === void 0 ? void 0 : _a.getBoundingClientRect();
                    const pos = {
                        x: lastTouch.clientX - ((_b = canvasRect === null || canvasRect === void 0 ? void 0 : canvasRect.left) !== null && _b !== void 0 ? _b : 0),
                        y: lastTouch.clientY - ((_c = canvasRect === null || canvasRect === void 0 ? void 0 : canvasRect.top) !== null && _c !== void 0 ? _c : 0),
                    };
                    clickOrTouchHandler(e, pos, Math.max(lastTouch.radiusX, lastTouch.radiusY));
                }
                touched = false;
                touchMoved = false;
            };
            const touchCancelHandler = () => {
                if (this.destroyed) {
                    return;
                }
                touched = false;
                touchMoved = false;
            };
            let touched = false;
            let touchMoved = false;
            el.addEventListener("click", clickHandler);
            el.addEventListener("touchstart", touchStartHandler);
            el.addEventListener("touchmove", touchMoveHandler);
            el.addEventListener("touchend", touchEndHandler);
            el.addEventListener("touchcancel", touchCancelHandler);
        }
        updateActualOptions() {
            this.actualOptions.responsive = [];
            const newMaxWidth = this.actualOptions.setResponsive(this.canvas.size.width, this.retina.pixelRatio, this._options);
            this.actualOptions.setTheme(this.currentTheme);
            if (this.responsiveMaxWidth != newMaxWidth) {
                this.responsiveMaxWidth = newMaxWidth;
                return true;
            }
            return false;
        }
        async init() {
            this._options = new Options_1.Options();
            for (const preset of this.presets) {
                this._options.load(Utils$2.Plugins.getPreset(preset));
            }
            const shapes = Utils$2.Plugins.getSupportedShapes();
            for (const type of shapes) {
                const drawer = Utils$2.Plugins.getShapeDrawer(type);
                if (drawer) {
                    this.drawers.set(type, drawer);
                }
            }
            this._options.load(this._initialSourceOptions);
            this._options.load(this._sourceOptions);
            this.actualOptions = new Options_1.Options();
            this.actualOptions.load(this._options);
            this.retina.init();
            this.canvas.init();
            this.updateActualOptions();
            this.canvas.initBackground();
            this.canvas.resize();
            this.zLayers = this.actualOptions.zLayers;
            this.duration = (0, Utils$2.getRangeValue)(this.actualOptions.duration);
            this.lifeTime = 0;
            this.fpsLimit = this.actualOptions.fpsLimit > 0 ? this.actualOptions.fpsLimit : 60;
            const availablePlugins = Utils$2.Plugins.getAvailablePlugins(this);
            for (const [id, plugin] of availablePlugins) {
                this.plugins.set(id, plugin);
            }
            for (const [, drawer] of this.drawers) {
                if (drawer.init) {
                    await drawer.init(this);
                }
            }
            for (const [, plugin] of this.plugins) {
                if (plugin.init) {
                    plugin.init(this.actualOptions);
                }
                else if (plugin.initAsync !== undefined) {
                    await plugin.initAsync(this.actualOptions);
                }
            }
            const pathOptions = this.actualOptions.particles.move.path;
            if (pathOptions.generator) {
                const customGenerator = Utils$2.Plugins.getPathGenerator(pathOptions.generator);
                if (customGenerator) {
                    if (customGenerator.init) {
                        this.pathGenerator.init = customGenerator.init;
                    }
                    if (customGenerator.generate) {
                        this.pathGenerator.generate = customGenerator.generate;
                    }
                    if (customGenerator.update) {
                        this.pathGenerator.update = customGenerator.update;
                    }
                }
            }
            this.particles.init();
            this.particles.setDensity();
            for (const [, plugin] of this.plugins) {
                if (plugin.particlesSetup !== undefined) {
                    plugin.particlesSetup();
                }
            }
        }
        intersectionManager(entries) {
            if (!this.actualOptions.pauseOnOutsideViewport) {
                return;
            }
            for (const entry of entries) {
                if (entry.target !== this.interactivity.element) {
                    continue;
                }
                if (entry.isIntersecting) {
                    this.play();
                }
                else {
                    this.pause();
                }
            }
        }
    }
    exports.Container = Container;
    });

    unwrapExports(Container_1);
    Container_1.Container;

    var Loader_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Loader = void 0;


    const tsParticlesDom = [];
    function fetchError(statusCode) {
        console.error(`Error tsParticles - fetch status: ${statusCode}`);
        console.error("Error tsParticles - File config not found");
    }
    class Loader {
        static dom() {
            return tsParticlesDom;
        }
        static domItem(index) {
            const dom = Loader.dom();
            const item = dom[index];
            if (item && !item.destroyed) {
                return item;
            }
            dom.splice(index, 1);
        }
        static async loadOptions(params) {
            var _a, _b, _c;
            const tagId = (_a = params.tagId) !== null && _a !== void 0 ? _a : `tsparticles${Math.floor(Math.random() * 10000)}`;
            const { options, index } = params;
            let domContainer = (_b = params.element) !== null && _b !== void 0 ? _b : document.getElementById(tagId);
            if (!domContainer) {
                domContainer = document.createElement("div");
                domContainer.id = tagId;
                (_c = document.querySelector("body")) === null || _c === void 0 ? void 0 : _c.append(domContainer);
            }
            const currentOptions = options instanceof Array ? (0, Utils$2.itemFromArray)(options, index) : options;
            const dom = Loader.dom();
            const oldIndex = dom.findIndex((v) => v.id === tagId);
            if (oldIndex >= 0) {
                const old = Loader.domItem(oldIndex);
                if (old && !old.destroyed) {
                    old.destroy();
                    dom.splice(oldIndex, 1);
                }
            }
            let canvasEl;
            let generatedCanvas;
            if (domContainer.tagName.toLowerCase() === "canvas") {
                canvasEl = domContainer;
                generatedCanvas = false;
            }
            else {
                const existingCanvases = domContainer.getElementsByTagName("canvas");
                if (existingCanvases.length) {
                    canvasEl = existingCanvases[0];
                    if (!canvasEl.className) {
                        canvasEl.className = Utils$2.Constants.canvasClass;
                    }
                    generatedCanvas = false;
                }
                else {
                    generatedCanvas = true;
                    canvasEl = document.createElement("canvas");
                    canvasEl.className = Utils$2.Constants.canvasClass;
                    canvasEl.style.width = "100%";
                    canvasEl.style.height = "100%";
                    domContainer.appendChild(canvasEl);
                }
            }
            const newItem = new Container_1.Container(tagId, currentOptions);
            if (oldIndex >= 0) {
                dom.splice(oldIndex, 0, newItem);
            }
            else {
                dom.push(newItem);
            }
            newItem.canvas.loadCanvas(canvasEl, generatedCanvas);
            await newItem.start();
            return newItem;
        }
        static async loadRemoteOptions(params) {
            const { url: jsonUrl, index } = params;
            const url = jsonUrl instanceof Array ? (0, Utils$2.itemFromArray)(jsonUrl, index) : jsonUrl;
            if (!url) {
                return;
            }
            const response = await fetch(url);
            if (!response.ok) {
                fetchError(response.status);
                return;
            }
            const data = await response.json();
            return await Loader.loadOptions({
                tagId: params.tagId,
                element: params.element,
                index,
                options: data,
            });
        }
        static load(tagId, options, index) {
            const params = { index };
            if (typeof tagId === "string") {
                params.tagId = tagId;
            }
            else {
                params.options = tagId;
            }
            if (typeof options === "number") {
                params.index = options !== null && options !== void 0 ? options : params.index;
            }
            else {
                params.options = options !== null && options !== void 0 ? options : params.options;
            }
            return this.loadOptions(params);
        }
        static async set(id, domContainer, options, index) {
            const params = { index };
            if (typeof id === "string") {
                params.tagId = id;
            }
            else {
                params.element = id;
            }
            if (domContainer instanceof HTMLElement) {
                params.element = domContainer;
            }
            else {
                params.options = domContainer;
            }
            if (typeof options === "number") {
                params.index = options;
            }
            else {
                params.options = options !== null && options !== void 0 ? options : params.options;
            }
            return this.loadOptions(params);
        }
        static async loadJSON(tagId, jsonUrl, index) {
            let url, id;
            if (typeof jsonUrl === "number" || jsonUrl === undefined) {
                url = tagId;
            }
            else {
                id = tagId;
                url = jsonUrl;
            }
            return await Loader.loadRemoteOptions({ tagId: id, url, index });
        }
        static async setJSON(id, domContainer, jsonUrl, index) {
            let url, newId, newIndex, element;
            if (id instanceof HTMLElement) {
                element = id;
                url = domContainer;
                newIndex = jsonUrl;
            }
            else {
                newId = id;
                element = domContainer;
                url = jsonUrl;
                newIndex = index;
            }
            return await Loader.loadRemoteOptions({ tagId: newId, url, index: newIndex, element });
        }
        static setOnClickHandler(callback) {
            const dom = Loader.dom();
            if (dom.length === 0) {
                throw new Error("Can only set click handlers after calling tsParticles.load() or tsParticles.loadJSON()");
            }
            for (const domItem of dom) {
                domItem.addClickHandler(callback);
            }
        }
    }
    exports.Loader = Loader;
    });

    unwrapExports(Loader_1);
    Loader_1.Loader;

    var main = createCommonjsModule(function (module, exports) {
    var __classPrivateFieldSet = (commonjsGlobal && commonjsGlobal.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
        if (kind === "m") throw new TypeError("Private method is not writable");
        if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
        if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
        return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
    };
    var __classPrivateFieldGet = (commonjsGlobal && commonjsGlobal.__classPrivateFieldGet) || function (receiver, state, kind, f) {
        if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
        if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
        return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
    };
    var _Main_initialized;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Main = void 0;


    class Main {
        constructor() {
            _Main_initialized.set(this, void 0);
            __classPrivateFieldSet(this, _Main_initialized, false, "f");
        }
        init() {
            if (!__classPrivateFieldGet(this, _Main_initialized, "f")) {
                __classPrivateFieldSet(this, _Main_initialized, true, "f");
            }
        }
        async loadFromArray(tagId, options, index) {
            return Loader_1.Loader.load(tagId, options, index);
        }
        async load(tagId, options) {
            return Loader_1.Loader.load(tagId, options);
        }
        async set(id, element, options) {
            return Loader_1.Loader.set(id, element, options);
        }
        async loadJSON(tagId, pathConfigJson, index) {
            return Loader_1.Loader.loadJSON(tagId, pathConfigJson, index);
        }
        async setJSON(id, element, pathConfigJson, index) {
            return Loader_1.Loader.setJSON(id, element, pathConfigJson, index);
        }
        setOnClickHandler(callback) {
            Loader_1.Loader.setOnClickHandler(callback);
        }
        dom() {
            return Loader_1.Loader.dom();
        }
        domItem(index) {
            return Loader_1.Loader.domItem(index);
        }
        async refresh() {
            for (const instance of this.dom()) {
                await instance.refresh();
            }
        }
        async addShape(shape, drawer, init, afterEffect, destroy) {
            let customDrawer;
            if (typeof drawer === "function") {
                customDrawer = {
                    afterEffect: afterEffect,
                    destroy: destroy,
                    draw: drawer,
                    init: init,
                };
            }
            else {
                customDrawer = drawer;
            }
            Utils$2.Plugins.addShapeDrawer(shape, customDrawer);
            await this.refresh();
        }
        async addPreset(preset, options, override = false) {
            Utils$2.Plugins.addPreset(preset, options, override);
            await this.refresh();
        }
        async addPlugin(plugin) {
            Utils$2.Plugins.addPlugin(plugin);
            await this.refresh();
        }
        async addPathGenerator(name, generator) {
            Utils$2.Plugins.addPathGenerator(name, generator);
            await this.refresh();
        }
        async addInteractor(name, interactorInitializer) {
            Utils$2.Plugins.addInteractor(name, interactorInitializer);
            await this.refresh();
        }
        async addParticleUpdater(name, updaterInitializer) {
            Utils$2.Plugins.addParticleUpdater(name, updaterInitializer);
            await this.refresh();
        }
    }
    exports.Main = Main;
    _Main_initialized = new WeakMap();
    });

    unwrapExports(main);
    main.Main;

    var CircleDrawer_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CircleDrawer = void 0;
    class CircleDrawer {
        getSidesCount() {
            return 12;
        }
        draw(context, particle, radius) {
            context.arc(0, 0, radius, 0, Math.PI * 2, false);
        }
    }
    exports.CircleDrawer = CircleDrawer;
    });

    unwrapExports(CircleDrawer_1);
    CircleDrawer_1.CircleDrawer;

    var Circle = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadCircleShape = void 0;

    async function loadCircleShape(tsParticles) {
        await tsParticles.addShape("circle", new CircleDrawer_1.CircleDrawer());
    }
    exports.loadCircleShape = loadCircleShape;
    });

    unwrapExports(Circle);
    Circle.loadCircleShape;

    var LifeUpdater_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.LifeUpdater = void 0;

    class LifeUpdater {
        constructor(container) {
            this.container = container;
        }
        init() {
        }
        isEnabled(particle) {
            return !particle.destroyed;
        }
        update(particle, delta) {
            if (!this.isEnabled(particle)) {
                return;
            }
            const life = particle.life;
            let justSpawned = false;
            if (particle.spawning) {
                life.delayTime += delta.value;
                if (life.delayTime >= particle.life.delay) {
                    justSpawned = true;
                    particle.spawning = false;
                    life.delayTime = 0;
                    life.time = 0;
                }
                else {
                    return;
                }
            }
            if (life.duration === -1) {
                return;
            }
            if (particle.spawning) {
                return;
            }
            if (justSpawned) {
                life.time = 0;
            }
            else {
                life.time += delta.value;
            }
            if (life.time < life.duration) {
                return;
            }
            life.time = 0;
            if (particle.life.count > 0) {
                particle.life.count--;
            }
            if (particle.life.count === 0) {
                particle.destroy();
                return;
            }
            const canvasSize = this.container.canvas.size, widthRange = (0, Utils$2.setRangeValue)(0, canvasSize.width), heightRange = (0, Utils$2.setRangeValue)(0, canvasSize.width);
            particle.position.x = (0, Utils$2.randomInRange)(widthRange);
            particle.position.y = (0, Utils$2.randomInRange)(heightRange);
            particle.spawning = true;
            life.delayTime = 0;
            life.time = 0;
            particle.reset();
            const lifeOptions = particle.options.life;
            life.delay = (0, Utils$2.getRangeValue)(lifeOptions.delay.value) * 1000;
            life.duration = (0, Utils$2.getRangeValue)(lifeOptions.duration.value) * 1000;
        }
    }
    exports.LifeUpdater = LifeUpdater;
    });

    unwrapExports(LifeUpdater_1);
    LifeUpdater_1.LifeUpdater;

    var Life = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadLifeUpdater = void 0;

    async function loadLifeUpdater(tsParticles) {
        await tsParticles.addParticleUpdater("life", (container) => new LifeUpdater_1.LifeUpdater(container));
    }
    exports.loadLifeUpdater = loadLifeUpdater;
    });

    unwrapExports(Life);
    Life.loadLifeUpdater;

    var ExternalInteractorBase_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ExternalInteractorBase = void 0;

    class ExternalInteractorBase {
        constructor(container) {
            this.container = container;
            this.type = Enums$3.InteractorType.External;
        }
    }
    exports.ExternalInteractorBase = ExternalInteractorBase;
    });

    unwrapExports(ExternalInteractorBase_1);
    ExternalInteractorBase_1.ExternalInteractorBase;

    var Connector_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Connector = void 0;



    class Connector extends ExternalInteractorBase_1.ExternalInteractorBase {
        constructor(container) {
            super(container);
        }
        isEnabled() {
            const container = this.container, mouse = container.interactivity.mouse, events = container.actualOptions.interactivity.events;
            if (!(events.onHover.enable && mouse.position)) {
                return false;
            }
            return (0, Utils$2.isInArray)(Enums$3.HoverMode.connect, events.onHover.mode);
        }
        reset() {
        }
        interact() {
            const container = this.container, options = container.actualOptions;
            if (options.interactivity.events.onHover.enable && container.interactivity.status === "mousemove") {
                const mousePos = container.interactivity.mouse.position;
                if (!mousePos) {
                    return;
                }
                const distance = Math.abs(container.retina.connectModeRadius), query = container.particles.quadTree.queryCircle(mousePos, distance);
                let i = 0;
                for (const p1 of query) {
                    const pos1 = p1.getPosition();
                    for (const p2 of query.slice(i + 1)) {
                        const pos2 = p2.getPosition(), distMax = Math.abs(container.retina.connectModeDistance), xDiff = Math.abs(pos1.x - pos2.x), yDiff = Math.abs(pos1.y - pos2.y);
                        if (xDiff < distMax && yDiff < distMax) {
                            container.canvas.drawConnectLine(p1, p2);
                        }
                    }
                    ++i;
                }
            }
        }
    }
    exports.Connector = Connector;
    });

    unwrapExports(Connector_1);
    Connector_1.Connector;

    var Connect = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadExternalConnectInteraction = void 0;

    async function loadExternalConnectInteraction(tsParticles) {
        await tsParticles.addInteractor("externalConnect", (container) => new Connector_1.Connector(container));
    }
    exports.loadExternalConnectInteraction = loadExternalConnectInteraction;
    });

    unwrapExports(Connect);
    Connect.loadExternalConnectInteraction;

    var OpacityUpdater_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.OpacityUpdater = void 0;


    function checkDestroy(particle, value, minValue, maxValue) {
        switch (particle.options.opacity.animation.destroy) {
            case Enums$3.DestroyType.max:
                if (value >= maxValue) {
                    particle.destroy();
                }
                break;
            case Enums$3.DestroyType.min:
                if (value <= minValue) {
                    particle.destroy();
                }
                break;
        }
    }
    function updateOpacity(particle, delta) {
        var _a, _b, _c, _d, _e;
        if (!particle.opacity) {
            return;
        }
        const minValue = particle.opacity.min;
        const maxValue = particle.opacity.max;
        if (!(!particle.destroyed &&
            particle.opacity.enable &&
            (((_a = particle.opacity.maxLoops) !== null && _a !== void 0 ? _a : 0) <= 0 || ((_b = particle.opacity.loops) !== null && _b !== void 0 ? _b : 0) < ((_c = particle.opacity.maxLoops) !== null && _c !== void 0 ? _c : 0)))) {
            return;
        }
        switch (particle.opacity.status) {
            case Enums$3.AnimationStatus.increasing:
                if (particle.opacity.value >= maxValue) {
                    particle.opacity.status = Enums$3.AnimationStatus.decreasing;
                    if (!particle.opacity.loops) {
                        particle.opacity.loops = 0;
                    }
                    particle.opacity.loops++;
                }
                else {
                    particle.opacity.value += ((_d = particle.opacity.velocity) !== null && _d !== void 0 ? _d : 0) * delta.factor;
                }
                break;
            case Enums$3.AnimationStatus.decreasing:
                if (particle.opacity.value <= minValue) {
                    particle.opacity.status = Enums$3.AnimationStatus.increasing;
                    if (!particle.opacity.loops) {
                        particle.opacity.loops = 0;
                    }
                    particle.opacity.loops++;
                }
                else {
                    particle.opacity.value -= ((_e = particle.opacity.velocity) !== null && _e !== void 0 ? _e : 0) * delta.factor;
                }
                break;
        }
        checkDestroy(particle, particle.opacity.value, minValue, maxValue);
        if (!particle.destroyed) {
            particle.opacity.value = (0, Utils$2.clamp)(particle.opacity.value, minValue, maxValue);
        }
    }
    class OpacityUpdater {
        constructor(container) {
            this.container = container;
        }
        init(particle) {
            const opacityOptions = particle.options.opacity;
            particle.opacity = {
                enable: opacityOptions.animation.enable,
                max: (0, Utils$2.getRangeMax)(opacityOptions.value),
                min: (0, Utils$2.getRangeMin)(opacityOptions.value),
                value: (0, Utils$2.getRangeValue)(opacityOptions.value),
                loops: 0,
                maxLoops: opacityOptions.animation.count,
            };
            const opacityAnimation = opacityOptions.animation;
            if (opacityAnimation.enable) {
                particle.opacity.status = Enums$3.AnimationStatus.increasing;
                const opacityRange = opacityOptions.value;
                particle.opacity.min = (0, Utils$2.getRangeMin)(opacityRange);
                particle.opacity.max = (0, Utils$2.getRangeMax)(opacityRange);
                switch (opacityAnimation.startValue) {
                    case Enums$3.StartValueType.min:
                        particle.opacity.value = particle.opacity.min;
                        particle.opacity.status = Enums$3.AnimationStatus.increasing;
                        break;
                    case Enums$3.StartValueType.random:
                        particle.opacity.value = (0, Utils$2.randomInRange)(particle.opacity);
                        particle.opacity.status =
                            Math.random() >= 0.5 ? Enums$3.AnimationStatus.increasing : Enums$3.AnimationStatus.decreasing;
                        break;
                    case Enums$3.StartValueType.max:
                    default:
                        particle.opacity.value = particle.opacity.max;
                        particle.opacity.status = Enums$3.AnimationStatus.decreasing;
                        break;
                }
                particle.opacity.velocity = (opacityAnimation.speed / 100) * this.container.retina.reduceFactor;
                if (!opacityAnimation.sync) {
                    particle.opacity.velocity *= Math.random();
                }
            }
        }
        isEnabled(particle) {
            var _a, _b, _c;
            return (!particle.destroyed &&
                !particle.spawning &&
                !!particle.opacity &&
                particle.opacity.enable &&
                (((_a = particle.opacity.maxLoops) !== null && _a !== void 0 ? _a : 0) <= 0 || ((_b = particle.opacity.loops) !== null && _b !== void 0 ? _b : 0) < ((_c = particle.opacity.maxLoops) !== null && _c !== void 0 ? _c : 0)));
        }
        update(particle, delta) {
            if (!this.isEnabled(particle)) {
                return;
            }
            updateOpacity(particle, delta);
        }
    }
    exports.OpacityUpdater = OpacityUpdater;
    });

    unwrapExports(OpacityUpdater_1);
    OpacityUpdater_1.OpacityUpdater;

    var Opacity = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadOpacityUpdater = void 0;

    async function loadOpacityUpdater(tsParticles) {
        await tsParticles.addParticleUpdater("opacity", (container) => new OpacityUpdater_1.OpacityUpdater(container));
    }
    exports.loadOpacityUpdater = loadOpacityUpdater;
    });

    unwrapExports(Opacity);
    Opacity.loadOpacityUpdater;

    var Utils$1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.replaceColorSvg = exports.downloadSvgImage = exports.loadImage = void 0;

    function loadImage(source) {
        return new Promise((resolve, reject) => {
            if (!source) {
                reject("Error tsParticles - No image.src");
                return;
            }
            const image = {
                source: source,
                type: source.substr(source.length - 3),
            };
            const img = new Image();
            img.addEventListener("load", () => {
                image.element = img;
                resolve(image);
            });
            img.addEventListener("error", () => {
                reject(`Error tsParticles - loading image: ${source}`);
            });
            img.src = source;
        });
    }
    exports.loadImage = loadImage;
    async function downloadSvgImage(source) {
        if (!source) {
            throw new Error("Error tsParticles - No image.src");
        }
        const image = {
            source: source,
            type: source.substr(source.length - 3),
        };
        if (image.type !== "svg") {
            return loadImage(source);
        }
        const response = await fetch(image.source);
        if (!response.ok) {
            throw new Error("Error tsParticles - Image not found");
        }
        image.svgData = await response.text();
        return image;
    }
    exports.downloadSvgImage = downloadSvgImage;
    function replaceColorSvg(imageShape, color, opacity) {
        const { svgData } = imageShape;
        if (!svgData) {
            return "";
        }
        if (svgData.includes("fill")) {
            const currentColor = /(#(?:[0-9a-f]{2}){2,4}|(#[0-9a-f]{3})|(rgb|hsl)a?\((-?\d+%?[,\s]+){2,3}\s*[\d.]+%?\))|currentcolor/gi;
            return svgData.replace(currentColor, () => (0, Utils$2.getStyleFromHsl)(color, opacity));
        }
        const preFillIndex = svgData.indexOf(">");
        return `${svgData.substring(0, preFillIndex)} fill="${(0, Utils$2.getStyleFromHsl)(color, opacity)}"${svgData.substring(preFillIndex)}`;
    }
    exports.replaceColorSvg = replaceColorSvg;
    });

    unwrapExports(Utils$1);
    Utils$1.replaceColorSvg;
    Utils$1.downloadSvgImage;
    Utils$1.loadImage;

    var ImageDrawer_1 = createCommonjsModule(function (module, exports) {
    var __classPrivateFieldSet = (commonjsGlobal && commonjsGlobal.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
        if (kind === "m") throw new TypeError("Private method is not writable");
        if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
        if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
        return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
    };
    var __classPrivateFieldGet = (commonjsGlobal && commonjsGlobal.__classPrivateFieldGet) || function (receiver, state, kind, f) {
        if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
        if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
        return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
    };
    var _ImageDrawer_images;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ImageDrawer = void 0;



    class ImageDrawer {
        constructor() {
            _ImageDrawer_images.set(this, void 0);
            __classPrivateFieldSet(this, _ImageDrawer_images, [], "f");
        }
        getSidesCount() {
            return 12;
        }
        getImages(container) {
            const containerImages = __classPrivateFieldGet(this, _ImageDrawer_images, "f").find((t) => t.id === container.id);
            if (!containerImages) {
                __classPrivateFieldGet(this, _ImageDrawer_images, "f").push({
                    id: container.id,
                    images: [],
                });
                return this.getImages(container);
            }
            else {
                return containerImages;
            }
        }
        addImage(container, image) {
            const containerImages = this.getImages(container);
            containerImages === null || containerImages === void 0 ? void 0 : containerImages.images.push(image);
        }
        async init(container) {
            await this.loadImagesFromParticlesOptions(container, container.actualOptions.particles);
            await this.loadImagesFromParticlesOptions(container, container.actualOptions.interactivity.modes.trail.particles);
            for (const manualParticle of container.actualOptions.manualParticles) {
                await this.loadImagesFromParticlesOptions(container, manualParticle.options);
            }
            const emitterOptions = container.actualOptions;
            if (emitterOptions.emitters) {
                if (emitterOptions.emitters instanceof Array) {
                    for (const emitter of emitterOptions.emitters) {
                        await this.loadImagesFromParticlesOptions(container, emitter.particles);
                    }
                }
                else {
                    await this.loadImagesFromParticlesOptions(container, emitterOptions.emitters.particles);
                }
            }
            const interactiveEmitters = emitterOptions.interactivity.modes.emitters;
            if (interactiveEmitters) {
                if (interactiveEmitters instanceof Array) {
                    for (const emitter of interactiveEmitters) {
                        await this.loadImagesFromParticlesOptions(container, emitter.particles);
                    }
                }
                else {
                    await this.loadImagesFromParticlesOptions(container, interactiveEmitters.particles);
                }
            }
        }
        destroy() {
            __classPrivateFieldSet(this, _ImageDrawer_images, [], "f");
        }
        async loadImagesFromParticlesOptions(container, options) {
            var _a, _b, _c;
            const shapeOptions = options === null || options === void 0 ? void 0 : options.shape;
            if (!(shapeOptions === null || shapeOptions === void 0 ? void 0 : shapeOptions.type) ||
                !shapeOptions.options ||
                (!(0, Utils$2.isInArray)(Enums$3.ShapeType.image, shapeOptions.type) && !(0, Utils$2.isInArray)(Enums$3.ShapeType.images, shapeOptions.type))) {
                return;
            }
            const idx = __classPrivateFieldGet(this, _ImageDrawer_images, "f").findIndex((t) => t.id === container.id);
            if (idx >= 0) {
                __classPrivateFieldGet(this, _ImageDrawer_images, "f").splice(idx, 1);
            }
            const imageOptions = (_a = shapeOptions.options[Enums$3.ShapeType.images]) !== null && _a !== void 0 ? _a : shapeOptions.options[Enums$3.ShapeType.image];
            if (imageOptions instanceof Array) {
                for (const optionsImage of imageOptions) {
                    await this.loadImageShape(container, optionsImage);
                }
            }
            else {
                await this.loadImageShape(container, imageOptions);
            }
            if (options === null || options === void 0 ? void 0 : options.groups) {
                for (const groupName in options.groups) {
                    const group = options.groups[groupName];
                    await this.loadImagesFromParticlesOptions(container, group);
                }
            }
            if ((_c = (_b = options === null || options === void 0 ? void 0 : options.destroy) === null || _b === void 0 ? void 0 : _b.split) === null || _c === void 0 ? void 0 : _c.particles) {
                await this.loadImagesFromParticlesOptions(container, options === null || options === void 0 ? void 0 : options.destroy.split.particles);
            }
        }
        async loadImageShape(container, imageShape) {
            try {
                const imageFunc = imageShape.replaceColor ? Utils$1.downloadSvgImage : Utils$1.loadImage;
                const image = await imageFunc(imageShape.src);
                if (image) {
                    this.addImage(container, image);
                }
            }
            catch (_a) {
                console.warn(`tsParticles error - ${imageShape.src} not found`);
            }
        }
        draw(context, particle, radius, opacity) {
            var _a, _b;
            if (!context) {
                return;
            }
            const image = particle.image;
            const element = (_a = image === null || image === void 0 ? void 0 : image.data) === null || _a === void 0 ? void 0 : _a.element;
            if (!element) {
                return;
            }
            const ratio = (_b = image === null || image === void 0 ? void 0 : image.ratio) !== null && _b !== void 0 ? _b : 1;
            const pos = {
                x: -radius,
                y: -radius,
            };
            if (!(image === null || image === void 0 ? void 0 : image.data.svgData) || !(image === null || image === void 0 ? void 0 : image.replaceColor)) {
                context.globalAlpha = opacity;
            }
            context.drawImage(element, pos.x, pos.y, radius * 2, (radius * 2) / ratio);
            if (!(image === null || image === void 0 ? void 0 : image.data.svgData) || !(image === null || image === void 0 ? void 0 : image.replaceColor)) {
                context.globalAlpha = 1;
            }
        }
        loadShape(particle) {
            var _a, _b, _c, _d, _e, _f, _g;
            if (particle.shape !== "image" && particle.shape !== "images") {
                return;
            }
            const images = this.getImages(particle.container).images;
            const imageData = particle.shapeData;
            const image = (_a = images.find((t) => t.source === imageData.src)) !== null && _a !== void 0 ? _a : images[0];
            const color = particle.getFillColor();
            let imageRes;
            if (!image) {
                return;
            }
            if (image.svgData !== undefined && imageData.replaceColor && color) {
                const svgColoredData = (0, Utils$1.replaceColorSvg)(image, color, (_c = (_b = particle.opacity) === null || _b === void 0 ? void 0 : _b.value) !== null && _c !== void 0 ? _c : 1);
                const svg = new Blob([svgColoredData], { type: "image/svg+xml" });
                const domUrl = URL || window.URL || window.webkitURL || window;
                const url = domUrl.createObjectURL(svg);
                const img = new Image();
                imageRes = {
                    data: Object.assign(Object.assign({}, image), { svgData: svgColoredData }),
                    ratio: imageData.width / imageData.height,
                    replaceColor: (_d = imageData.replaceColor) !== null && _d !== void 0 ? _d : imageData.replace_color,
                    source: imageData.src,
                };
                img.addEventListener("load", () => {
                    const pImage = particle.image;
                    if (pImage) {
                        pImage.loaded = true;
                        image.element = img;
                    }
                    domUrl.revokeObjectURL(url);
                });
                img.addEventListener("error", () => {
                    domUrl.revokeObjectURL(url);
                    (0, Utils$1.loadImage)(imageData.src).then((img2) => {
                        const pImage = particle.image;
                        if (pImage) {
                            image.element = img2 === null || img2 === void 0 ? void 0 : img2.element;
                            pImage.loaded = true;
                        }
                    });
                });
                img.src = url;
            }
            else {
                imageRes = {
                    data: image,
                    loaded: true,
                    ratio: imageData.width / imageData.height,
                    replaceColor: (_e = imageData.replaceColor) !== null && _e !== void 0 ? _e : imageData.replace_color,
                    source: imageData.src,
                };
            }
            if (!imageRes.ratio) {
                imageRes.ratio = 1;
            }
            const fill = (_f = imageData.fill) !== null && _f !== void 0 ? _f : particle.fill;
            const close = (_g = imageData.close) !== null && _g !== void 0 ? _g : particle.close;
            const imageShape = {
                image: imageRes,
                fill,
                close,
            };
            particle.image = imageShape.image;
            particle.fill = imageShape.fill;
            particle.close = imageShape.close;
        }
    }
    exports.ImageDrawer = ImageDrawer;
    _ImageDrawer_images = new WeakMap();
    });

    unwrapExports(ImageDrawer_1);
    ImageDrawer_1.ImageDrawer;

    var Image$1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadImageShape = void 0;

    async function loadImageShape(tsParticles) {
        const imageDrawer = new ImageDrawer_1.ImageDrawer();
        await tsParticles.addShape("image", imageDrawer);
        await tsParticles.addShape("images", imageDrawer);
    }
    exports.loadImageShape = loadImageShape;
    });

    unwrapExports(Image$1);
    Image$1.loadImageShape;

    var PolygonDrawerBase_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.PolygonDrawerBase = void 0;
    class PolygonDrawerBase {
        getSidesCount(particle) {
            var _a, _b;
            const polygon = particle.shapeData;
            return (_b = (_a = polygon === null || polygon === void 0 ? void 0 : polygon.sides) !== null && _a !== void 0 ? _a : polygon === null || polygon === void 0 ? void 0 : polygon.nb_sides) !== null && _b !== void 0 ? _b : 5;
        }
        draw(context, particle, radius) {
            const start = this.getCenter(particle, radius);
            const side = this.getSidesData(particle, radius);
            const sideCount = side.count.numerator * side.count.denominator;
            const decimalSides = side.count.numerator / side.count.denominator;
            const interiorAngleDegrees = (180 * (decimalSides - 2)) / decimalSides;
            const interiorAngle = Math.PI - (Math.PI * interiorAngleDegrees) / 180;
            if (!context) {
                return;
            }
            context.beginPath();
            context.translate(start.x, start.y);
            context.moveTo(0, 0);
            for (let i = 0; i < sideCount; i++) {
                context.lineTo(side.length, 0);
                context.translate(side.length, 0);
                context.rotate(interiorAngle);
            }
        }
    }
    exports.PolygonDrawerBase = PolygonDrawerBase;
    });

    unwrapExports(PolygonDrawerBase_1);
    PolygonDrawerBase_1.PolygonDrawerBase;

    var PolygonDrawer_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.PolygonDrawer = void 0;

    class PolygonDrawer extends PolygonDrawerBase_1.PolygonDrawerBase {
        getSidesData(particle, radius) {
            var _a, _b;
            const polygon = particle.shapeData;
            const sides = (_b = (_a = polygon === null || polygon === void 0 ? void 0 : polygon.sides) !== null && _a !== void 0 ? _a : polygon === null || polygon === void 0 ? void 0 : polygon.nb_sides) !== null && _b !== void 0 ? _b : 5;
            return {
                count: {
                    denominator: 1,
                    numerator: sides,
                },
                length: (radius * 2.66) / (sides / 3),
            };
        }
        getCenter(particle, radius) {
            const sides = this.getSidesCount(particle);
            return {
                x: -radius / (sides / 3.5),
                y: -radius / (2.66 / 3.5),
            };
        }
    }
    exports.PolygonDrawer = PolygonDrawer;
    });

    unwrapExports(PolygonDrawer_1);
    PolygonDrawer_1.PolygonDrawer;

    var TriangleDrawer_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.TriangleDrawer = void 0;

    class TriangleDrawer extends PolygonDrawerBase_1.PolygonDrawerBase {
        getSidesCount() {
            return 3;
        }
        getSidesData(particle, radius) {
            return {
                count: {
                    denominator: 2,
                    numerator: 3,
                },
                length: radius * 2,
            };
        }
        getCenter(particle, radius) {
            return {
                x: -radius,
                y: radius / 1.66,
            };
        }
    }
    exports.TriangleDrawer = TriangleDrawer;
    });

    unwrapExports(TriangleDrawer_1);
    TriangleDrawer_1.TriangleDrawer;

    var Polygon = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadPolygonShape = exports.loadTriangleShape = exports.loadGenericPolygonShape = void 0;


    async function loadGenericPolygonShape(tsParticles) {
        await tsParticles.addShape("polygon", new PolygonDrawer_1.PolygonDrawer());
    }
    exports.loadGenericPolygonShape = loadGenericPolygonShape;
    async function loadTriangleShape(tsParticles) {
        await tsParticles.addShape("triangle", new TriangleDrawer_1.TriangleDrawer());
    }
    exports.loadTriangleShape = loadTriangleShape;
    async function loadPolygonShape(tsParticles) {
        await loadGenericPolygonShape(tsParticles);
        await loadTriangleShape(tsParticles);
    }
    exports.loadPolygonShape = loadPolygonShape;
    });

    unwrapExports(Polygon);
    Polygon.loadPolygonShape;
    Polygon.loadTriangleShape;
    Polygon.loadGenericPolygonShape;

    var ProcessBubbleType_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ProcessBubbleType = void 0;
    (function (ProcessBubbleType) {
        ProcessBubbleType["color"] = "color";
        ProcessBubbleType["opacity"] = "opacity";
        ProcessBubbleType["size"] = "size";
    })(exports.ProcessBubbleType || (exports.ProcessBubbleType = {}));
    });

    unwrapExports(ProcessBubbleType_1);
    ProcessBubbleType_1.ProcessBubbleType;

    var Bubbler_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Bubbler = void 0;




    function calculateBubbleValue(particleValue, modeValue, optionsValue, ratio) {
        if (modeValue >= optionsValue) {
            const value = particleValue + (modeValue - optionsValue) * ratio;
            return (0, Utils$2.clamp)(value, particleValue, modeValue);
        }
        else if (modeValue < optionsValue) {
            const value = particleValue - (optionsValue - modeValue) * ratio;
            return (0, Utils$2.clamp)(value, modeValue, particleValue);
        }
    }
    class Bubbler extends ExternalInteractorBase_1.ExternalInteractorBase {
        constructor(container) {
            super(container);
        }
        isEnabled() {
            const container = this.container, options = container.actualOptions, mouse = container.interactivity.mouse, events = options.interactivity.events, divs = events.onDiv, divBubble = (0, Utils$2.isDivModeEnabled)(Enums$3.DivMode.bubble, divs);
            if (!(divBubble || (events.onHover.enable && mouse.position) || (events.onClick.enable && mouse.clickPosition))) {
                return false;
            }
            const hoverMode = events.onHover.mode;
            const clickMode = events.onClick.mode;
            return (0, Utils$2.isInArray)(Enums$3.HoverMode.bubble, hoverMode) || (0, Utils$2.isInArray)(Enums$3.ClickMode.bubble, clickMode) || divBubble;
        }
        reset(particle, force) {
            if (!(!particle.bubble.inRange || force)) {
                return;
            }
            delete particle.bubble.div;
            delete particle.bubble.opacity;
            delete particle.bubble.radius;
            delete particle.bubble.color;
        }
        interact() {
            const options = this.container.actualOptions, events = options.interactivity.events, onHover = events.onHover, onClick = events.onClick, hoverEnabled = onHover.enable, hoverMode = onHover.mode, clickEnabled = onClick.enable, clickMode = onClick.mode, divs = events.onDiv;
            if (hoverEnabled && (0, Utils$2.isInArray)(Enums$3.HoverMode.bubble, hoverMode)) {
                this.hoverBubble();
            }
            else if (clickEnabled && (0, Utils$2.isInArray)(Enums$3.ClickMode.bubble, clickMode)) {
                this.clickBubble();
            }
            else {
                (0, Utils$2.divModeExecute)(Enums$3.DivMode.bubble, divs, (selector, div) => this.singleSelectorHover(selector, div));
            }
        }
        singleSelectorHover(selector, div) {
            const container = this.container, selectors = document.querySelectorAll(selector);
            if (!selectors.length) {
                return;
            }
            selectors.forEach((item) => {
                const elem = item, pxRatio = container.retina.pixelRatio, pos = {
                    x: (elem.offsetLeft + elem.offsetWidth / 2) * pxRatio,
                    y: (elem.offsetTop + elem.offsetHeight / 2) * pxRatio,
                }, repulseRadius = (elem.offsetWidth / 2) * pxRatio, area = div.type === Enums$3.DivType.circle
                    ? new Utils$2.Circle(pos.x, pos.y, repulseRadius)
                    : new Utils$2.Rectangle(elem.offsetLeft * pxRatio, elem.offsetTop * pxRatio, elem.offsetWidth * pxRatio, elem.offsetHeight * pxRatio), query = container.particles.quadTree.query(area);
                for (const particle of query) {
                    if (!area.contains(particle.getPosition())) {
                        continue;
                    }
                    particle.bubble.inRange = true;
                    const divs = container.actualOptions.interactivity.modes.bubble.divs;
                    const divBubble = (0, Utils$2.divMode)(divs, elem);
                    if (!particle.bubble.div || particle.bubble.div !== elem) {
                        this.reset(particle, true);
                        particle.bubble.div = elem;
                    }
                    this.hoverBubbleSize(particle, 1, divBubble);
                    this.hoverBubbleOpacity(particle, 1, divBubble);
                    this.hoverBubbleColor(particle, 1, divBubble);
                }
            });
        }
        process(particle, distMouse, timeSpent, data) {
            const container = this.container, bubbleParam = data.bubbleObj.optValue;
            if (bubbleParam === undefined) {
                return;
            }
            const options = container.actualOptions, bubbleDuration = options.interactivity.modes.bubble.duration, bubbleDistance = container.retina.bubbleModeDistance, particlesParam = data.particlesObj.optValue, pObjBubble = data.bubbleObj.value, pObj = data.particlesObj.value || 0, type = data.type;
            if (bubbleParam === particlesParam) {
                return;
            }
            if (!container.bubble.durationEnd) {
                if (distMouse <= bubbleDistance) {
                    const obj = pObjBubble !== null && pObjBubble !== void 0 ? pObjBubble : pObj;
                    if (obj !== bubbleParam) {
                        const value = pObj - (timeSpent * (pObj - bubbleParam)) / bubbleDuration;
                        if (type === ProcessBubbleType_1.ProcessBubbleType.size) {
                            particle.bubble.radius = value;
                        }
                        if (type === ProcessBubbleType_1.ProcessBubbleType.opacity) {
                            particle.bubble.opacity = value;
                        }
                    }
                }
                else {
                    if (type === ProcessBubbleType_1.ProcessBubbleType.size) {
                        delete particle.bubble.radius;
                    }
                    if (type === ProcessBubbleType_1.ProcessBubbleType.opacity) {
                        delete particle.bubble.opacity;
                    }
                }
            }
            else if (pObjBubble) {
                if (type === ProcessBubbleType_1.ProcessBubbleType.size) {
                    delete particle.bubble.radius;
                }
                if (type === ProcessBubbleType_1.ProcessBubbleType.opacity) {
                    delete particle.bubble.opacity;
                }
            }
        }
        clickBubble() {
            var _a, _b;
            const container = this.container, options = container.actualOptions, mouseClickPos = container.interactivity.mouse.clickPosition;
            if (!mouseClickPos) {
                return;
            }
            const distance = container.retina.bubbleModeDistance, query = container.particles.quadTree.queryCircle(mouseClickPos, distance);
            for (const particle of query) {
                if (!container.bubble.clicking) {
                    continue;
                }
                particle.bubble.inRange = !container.bubble.durationEnd;
                const pos = particle.getPosition(), distMouse = (0, Utils$2.getDistance)(pos, mouseClickPos), timeSpent = (new Date().getTime() - (container.interactivity.mouse.clickTime || 0)) / 1000;
                if (timeSpent > options.interactivity.modes.bubble.duration) {
                    container.bubble.durationEnd = true;
                }
                if (timeSpent > options.interactivity.modes.bubble.duration * 2) {
                    container.bubble.clicking = false;
                    container.bubble.durationEnd = false;
                }
                const sizeData = {
                    bubbleObj: {
                        optValue: container.retina.bubbleModeSize,
                        value: particle.bubble.radius,
                    },
                    particlesObj: {
                        optValue: (0, Utils$2.getRangeMax)(particle.options.size.value) * container.retina.pixelRatio,
                        value: particle.size.value,
                    },
                    type: ProcessBubbleType_1.ProcessBubbleType.size,
                };
                this.process(particle, distMouse, timeSpent, sizeData);
                const opacityData = {
                    bubbleObj: {
                        optValue: options.interactivity.modes.bubble.opacity,
                        value: particle.bubble.opacity,
                    },
                    particlesObj: {
                        optValue: (0, Utils$2.getRangeMax)(particle.options.opacity.value),
                        value: (_b = (_a = particle.opacity) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : 1,
                    },
                    type: ProcessBubbleType_1.ProcessBubbleType.opacity,
                };
                this.process(particle, distMouse, timeSpent, opacityData);
                if (!container.bubble.durationEnd) {
                    if (distMouse <= container.retina.bubbleModeDistance) {
                        this.hoverBubbleColor(particle, distMouse);
                    }
                    else {
                        delete particle.bubble.color;
                    }
                }
                else {
                    delete particle.bubble.color;
                }
            }
        }
        hoverBubble() {
            const container = this.container, mousePos = container.interactivity.mouse.position;
            if (mousePos === undefined) {
                return;
            }
            const distance = container.retina.bubbleModeDistance, query = container.particles.quadTree.queryCircle(mousePos, distance);
            for (const particle of query) {
                particle.bubble.inRange = true;
                const pos = particle.getPosition(), pointDistance = (0, Utils$2.getDistance)(pos, mousePos), ratio = 1 - pointDistance / distance;
                if (pointDistance <= distance) {
                    if (ratio >= 0 && container.interactivity.status === Utils$2.Constants.mouseMoveEvent) {
                        this.hoverBubbleSize(particle, ratio);
                        this.hoverBubbleOpacity(particle, ratio);
                        this.hoverBubbleColor(particle, ratio);
                    }
                }
                else {
                    this.reset(particle);
                }
                if (container.interactivity.status === Utils$2.Constants.mouseLeaveEvent) {
                    this.reset(particle);
                }
            }
        }
        hoverBubbleSize(particle, ratio, divBubble) {
            const container = this.container, modeSize = (divBubble === null || divBubble === void 0 ? void 0 : divBubble.size) ? divBubble.size * container.retina.pixelRatio : container.retina.bubbleModeSize;
            if (modeSize === undefined) {
                return;
            }
            const optSize = (0, Utils$2.getRangeMax)(particle.options.size.value) * container.retina.pixelRatio;
            const pSize = particle.size.value;
            const size = calculateBubbleValue(pSize, modeSize, optSize, ratio);
            if (size !== undefined) {
                particle.bubble.radius = size;
            }
        }
        hoverBubbleOpacity(particle, ratio, divBubble) {
            var _a, _b, _c;
            const container = this.container, options = container.actualOptions, modeOpacity = (_a = divBubble === null || divBubble === void 0 ? void 0 : divBubble.opacity) !== null && _a !== void 0 ? _a : options.interactivity.modes.bubble.opacity;
            if (!modeOpacity) {
                return;
            }
            const optOpacity = particle.options.opacity.value;
            const pOpacity = (_c = (_b = particle.opacity) === null || _b === void 0 ? void 0 : _b.value) !== null && _c !== void 0 ? _c : 1;
            const opacity = calculateBubbleValue(pOpacity, modeOpacity, (0, Utils$2.getRangeMax)(optOpacity), ratio);
            if (opacity !== undefined) {
                particle.bubble.opacity = opacity;
            }
        }
        hoverBubbleColor(particle, ratio, divBubble) {
            const options = this.container.actualOptions;
            const bubbleOptions = divBubble !== null && divBubble !== void 0 ? divBubble : options.interactivity.modes.bubble;
            if (!particle.bubble.finalColor) {
                const modeColor = bubbleOptions.color;
                if (!modeColor) {
                    return;
                }
                const bubbleColor = modeColor instanceof Array ? (0, Utils$2.itemFromArray)(modeColor) : modeColor;
                particle.bubble.finalColor = (0, Utils$2.colorToHsl)(bubbleColor);
            }
            if (!particle.bubble.finalColor) {
                return;
            }
            if (bubbleOptions.mix) {
                particle.bubble.color = undefined;
                const pColor = particle.getFillColor();
                particle.bubble.color = pColor
                    ? (0, Utils$2.rgbToHsl)((0, Utils$2.colorMix)(pColor, particle.bubble.finalColor, 1 - ratio, ratio))
                    : particle.bubble.finalColor;
            }
            else {
                particle.bubble.color = particle.bubble.finalColor;
            }
        }
    }
    exports.Bubbler = Bubbler;
    });

    unwrapExports(Bubbler_1);
    Bubbler_1.Bubbler;

    var Bubble = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadExternalBubbleInteraction = void 0;

    async function loadExternalBubbleInteraction(tsParticles) {
        await tsParticles.addInteractor("externalBubble", (container) => new Bubbler_1.Bubbler(container));
    }
    exports.loadExternalBubbleInteraction = loadExternalBubbleInteraction;
    });

    unwrapExports(Bubble);
    Bubble.loadExternalBubbleInteraction;

    var Attractor_1$1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Attractor = void 0;




    class Attractor extends ExternalInteractorBase_1.ExternalInteractorBase {
        constructor(container) {
            super(container);
        }
        isEnabled() {
            const container = this.container, options = container.actualOptions, mouse = container.interactivity.mouse, events = options.interactivity.events;
            if ((!mouse.position || !events.onHover.enable) && (!mouse.clickPosition || !events.onClick.enable)) {
                return false;
            }
            const hoverMode = events.onHover.mode, clickMode = events.onClick.mode;
            return (0, Utils$2.isInArray)(Enums$3.HoverMode.attract, hoverMode) || (0, Utils$2.isInArray)(Enums$3.ClickMode.attract, clickMode);
        }
        reset() {
        }
        interact() {
            const container = this.container, options = container.actualOptions, mouseMoveStatus = container.interactivity.status === Utils$2.Constants.mouseMoveEvent, events = options.interactivity.events, hoverEnabled = events.onHover.enable, hoverMode = events.onHover.mode, clickEnabled = events.onClick.enable, clickMode = events.onClick.mode;
            if (mouseMoveStatus && hoverEnabled && (0, Utils$2.isInArray)(Enums$3.HoverMode.attract, hoverMode)) {
                this.hoverAttract();
            }
            else if (clickEnabled && (0, Utils$2.isInArray)(Enums$3.ClickMode.attract, clickMode)) {
                this.clickAttract();
            }
        }
        hoverAttract() {
            const container = this.container;
            const mousePos = container.interactivity.mouse.position;
            if (!mousePos) {
                return;
            }
            const attractRadius = container.retina.attractModeDistance;
            this.processAttract(mousePos, attractRadius, new Utils$2.Circle(mousePos.x, mousePos.y, attractRadius));
        }
        processAttract(position, attractRadius, area) {
            const container = this.container;
            const attractOptions = container.actualOptions.interactivity.modes.attract;
            const query = container.particles.quadTree.query(area);
            for (const particle of query) {
                const { dx, dy, distance } = (0, Utils$2.getDistances)(particle.position, position);
                const velocity = attractOptions.speed * attractOptions.factor;
                const attractFactor = (0, Utils$2.clamp)((0, Utils$2.calcEasing)(1 - distance / attractRadius, attractOptions.easing) * velocity, 0, attractOptions.maxSpeed);
                const normVec = Vector_1.Vector.create(distance === 0 ? velocity : (dx / distance) * attractFactor, distance === 0 ? velocity : (dy / distance) * attractFactor);
                particle.position.subFrom(normVec);
            }
        }
        clickAttract() {
            const container = this.container;
            if (!container.attract.finish) {
                if (!container.attract.count) {
                    container.attract.count = 0;
                }
                container.attract.count++;
                if (container.attract.count === container.particles.count) {
                    container.attract.finish = true;
                }
            }
            if (container.attract.clicking) {
                const mousePos = container.interactivity.mouse.clickPosition;
                if (!mousePos) {
                    return;
                }
                const attractRadius = container.retina.attractModeDistance;
                this.processAttract(mousePos, attractRadius, new Utils$2.Circle(mousePos.x, mousePos.y, attractRadius));
            }
            else if (container.attract.clicking === false) {
                container.attract.particles = [];
            }
            return;
        }
    }
    exports.Attractor = Attractor;
    });

    unwrapExports(Attractor_1$1);
    Attractor_1$1.Attractor;

    var Attract$1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadExternalAttractInteraction = void 0;

    async function loadExternalAttractInteraction(tsParticles) {
        await tsParticles.addInteractor("externalAttract", (container) => new Attractor_1$1.Attractor(container));
    }
    exports.loadExternalAttractInteraction = loadExternalAttractInteraction;
    });

    unwrapExports(Attract$1);
    Attract$1.loadExternalAttractInteraction;

    var Grabber_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Grabber = void 0;



    class Grabber extends ExternalInteractorBase_1.ExternalInteractorBase {
        constructor(container) {
            super(container);
        }
        isEnabled() {
            const container = this.container, mouse = container.interactivity.mouse, events = container.actualOptions.interactivity.events;
            return events.onHover.enable && !!mouse.position && (0, Utils$2.isInArray)(Enums$3.HoverMode.grab, events.onHover.mode);
        }
        reset() {
        }
        interact() {
            var _a;
            const container = this.container, options = container.actualOptions, interactivity = options.interactivity;
            if (interactivity.events.onHover.enable && container.interactivity.status === Utils$2.Constants.mouseMoveEvent) {
                const mousePos = container.interactivity.mouse.position;
                if (!mousePos) {
                    return;
                }
                const distance = container.retina.grabModeDistance, query = container.particles.quadTree.queryCircle(mousePos, distance);
                for (const particle of query) {
                    const pos = particle.getPosition(), pointDistance = (0, Utils$2.getDistance)(pos, mousePos);
                    if (pointDistance <= distance) {
                        const grabLineOptions = interactivity.modes.grab.links, lineOpacity = grabLineOptions.opacity, opacityLine = lineOpacity - (pointDistance * lineOpacity) / distance;
                        if (opacityLine <= 0) {
                            continue;
                        }
                        const optColor = (_a = grabLineOptions.color) !== null && _a !== void 0 ? _a : particle.options.links.color;
                        if (!container.particles.grabLineColor) {
                            const linksOptions = options.interactivity.modes.grab.links;
                            container.particles.grabLineColor = (0, Utils$2.getLinkRandomColor)(optColor, linksOptions.blink, linksOptions.consent);
                        }
                        const colorLine = (0, Utils$2.getLinkColor)(particle, undefined, container.particles.grabLineColor);
                        if (!colorLine) {
                            return;
                        }
                        container.canvas.drawGrabLine(particle, colorLine, opacityLine, mousePos);
                    }
                }
            }
        }
    }
    exports.Grabber = Grabber;
    });

    unwrapExports(Grabber_1);
    Grabber_1.Grabber;

    var Grab = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadExternalGrabInteraction = void 0;

    async function loadExternalGrabInteraction(tsParticles) {
        await tsParticles.addInteractor("externalGrab", (container) => new Grabber_1.Grabber(container));
    }
    exports.loadExternalGrabInteraction = loadExternalGrabInteraction;
    });

    unwrapExports(Grab);
    Grab.loadExternalGrabInteraction;

    var StarDrawer_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.StarDrawer = void 0;
    class StarDrawer {
        getSidesCount(particle) {
            var _a, _b;
            const star = particle.shapeData;
            return (_b = (_a = star === null || star === void 0 ? void 0 : star.sides) !== null && _a !== void 0 ? _a : star === null || star === void 0 ? void 0 : star.nb_sides) !== null && _b !== void 0 ? _b : 5;
        }
        draw(context, particle, radius) {
            var _a;
            const star = particle.shapeData;
            const sides = this.getSidesCount(particle);
            const inset = (_a = star === null || star === void 0 ? void 0 : star.inset) !== null && _a !== void 0 ? _a : 2;
            context.moveTo(0, 0 - radius);
            for (let i = 0; i < sides; i++) {
                context.rotate(Math.PI / sides);
                context.lineTo(0, 0 - radius * inset);
                context.rotate(Math.PI / sides);
                context.lineTo(0, 0 - radius);
            }
        }
    }
    exports.StarDrawer = StarDrawer;
    });

    unwrapExports(StarDrawer_1);
    StarDrawer_1.StarDrawer;

    var Star = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadStarShape = void 0;

    async function loadStarShape(tsParticles) {
        await tsParticles.addShape("star", new StarDrawer_1.StarDrawer());
    }
    exports.loadStarShape = loadStarShape;
    });

    unwrapExports(Star);
    Star.loadStarShape;

    var ParticlesInteractorBase_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ParticlesInteractorBase = void 0;

    class ParticlesInteractorBase {
        constructor(container) {
            this.container = container;
            this.type = Enums$3.InteractorType.Particles;
        }
    }
    exports.ParticlesInteractorBase = ParticlesInteractorBase;
    });

    unwrapExports(ParticlesInteractorBase_1);
    ParticlesInteractorBase_1.ParticlesInteractorBase;

    var Attractor_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Attractor = void 0;


    class Attractor extends ParticlesInteractorBase_1.ParticlesInteractorBase {
        constructor(container) {
            super(container);
        }
        interact(p1) {
            var _a;
            const container = this.container, distance = (_a = p1.retina.attractDistance) !== null && _a !== void 0 ? _a : container.retina.attractDistance, pos1 = p1.getPosition(), query = container.particles.quadTree.queryCircle(pos1, distance);
            for (const p2 of query) {
                if (p1 === p2 || !p2.options.move.attract.enable || p2.destroyed || p2.spawning) {
                    continue;
                }
                const pos2 = p2.getPosition(), { dx, dy } = (0, Utils$2.getDistances)(pos1, pos2), rotate = p1.options.move.attract.rotate, ax = dx / (rotate.x * 1000), ay = dy / (rotate.y * 1000), p1Factor = p2.size.value / p1.size.value, p2Factor = 1 / p1Factor;
                p1.velocity.x -= ax * p1Factor;
                p1.velocity.y -= ay * p1Factor;
                p2.velocity.x += ax * p2Factor;
                p2.velocity.y += ay * p2Factor;
            }
        }
        isEnabled(particle) {
            return particle.options.move.attract.enable;
        }
        reset() {
        }
    }
    exports.Attractor = Attractor;
    });

    unwrapExports(Attractor_1);
    Attractor_1.Attractor;

    var Attract = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadParticlesAttractInteraction = void 0;

    async function loadParticlesAttractInteraction(tsParticles) {
        await tsParticles.addInteractor("particlesAttract", (container) => new Attractor_1.Attractor(container));
    }
    exports.loadParticlesAttractInteraction = loadParticlesAttractInteraction;
    });

    unwrapExports(Attract);
    Attract.loadParticlesAttractInteraction;

    var SquareDrawer_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SquareDrawer = void 0;
    const fixFactor = Math.sqrt(2);
    class SquareDrawer {
        getSidesCount() {
            return 4;
        }
        draw(context, particle, radius) {
            context.rect(-radius / fixFactor, -radius / fixFactor, (radius * 2) / fixFactor, (radius * 2) / fixFactor);
        }
    }
    exports.SquareDrawer = SquareDrawer;
    });

    unwrapExports(SquareDrawer_1);
    SquareDrawer_1.SquareDrawer;

    var Square = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadSquareShape = void 0;

    async function loadSquareShape(tsParticles) {
        const drawer = new SquareDrawer_1.SquareDrawer();
        await tsParticles.addShape("edge", drawer);
        await tsParticles.addShape("square", drawer);
    }
    exports.loadSquareShape = loadSquareShape;
    });

    unwrapExports(Square);
    Square.loadSquareShape;

    var StrokeColorUpdater_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.StrokeColorUpdater = void 0;


    function updateColorValue(delta, value, valueAnimation, max, decrease) {
        var _a;
        const colorValue = value;
        if (!colorValue || !colorValue.enable) {
            return;
        }
        const offset = (0, Utils$2.randomInRange)(valueAnimation.offset);
        const velocity = ((_a = value.velocity) !== null && _a !== void 0 ? _a : 0) * delta.factor + offset * 3.6;
        if (!decrease || colorValue.status === Enums$3.AnimationStatus.increasing) {
            colorValue.value += velocity;
            if (decrease && colorValue.value > max) {
                colorValue.status = Enums$3.AnimationStatus.decreasing;
                colorValue.value -= colorValue.value % max;
            }
        }
        else {
            colorValue.value -= velocity;
            if (colorValue.value < 0) {
                colorValue.status = Enums$3.AnimationStatus.increasing;
                colorValue.value += colorValue.value;
            }
        }
        if (colorValue.value > max) {
            colorValue.value %= max;
        }
    }
    function updateStrokeColor(particle, delta) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        if (!((_a = particle.stroke) === null || _a === void 0 ? void 0 : _a.color)) {
            return;
        }
        const animationOptions = particle.stroke.color.animation;
        const h = (_c = (_b = particle.strokeColor) === null || _b === void 0 ? void 0 : _b.h) !== null && _c !== void 0 ? _c : (_d = particle.color) === null || _d === void 0 ? void 0 : _d.h;
        if (h) {
            updateColorValue(delta, h, animationOptions.h, 360, false);
        }
        const s = (_f = (_e = particle.strokeColor) === null || _e === void 0 ? void 0 : _e.s) !== null && _f !== void 0 ? _f : (_g = particle.color) === null || _g === void 0 ? void 0 : _g.s;
        if (s) {
            updateColorValue(delta, s, animationOptions.s, 100, true);
        }
        const l = (_j = (_h = particle.strokeColor) === null || _h === void 0 ? void 0 : _h.l) !== null && _j !== void 0 ? _j : (_k = particle.color) === null || _k === void 0 ? void 0 : _k.l;
        if (l) {
            updateColorValue(delta, l, animationOptions.l, 100, true);
        }
    }
    class StrokeColorUpdater {
        constructor(container) {
            this.container = container;
        }
        init(particle) {
            var _a, _b;
            const container = this.container;
            particle.stroke =
                particle.options.stroke instanceof Array
                    ? (0, Utils$2.itemFromArray)(particle.options.stroke, particle.id, particle.options.reduceDuplicates)
                    : particle.options.stroke;
            particle.strokeWidth = particle.stroke.width * container.retina.pixelRatio;
            const strokeHslColor = (_a = (0, Utils$2.colorToHsl)(particle.stroke.color)) !== null && _a !== void 0 ? _a : particle.getFillColor();
            if (strokeHslColor) {
                particle.strokeColor = (0, Utils$2.getHslAnimationFromHsl)(strokeHslColor, (_b = particle.stroke.color) === null || _b === void 0 ? void 0 : _b.animation, container.retina.reduceFactor);
            }
        }
        isEnabled(particle) {
            var _a, _b, _c, _d;
            const color = (_a = particle.stroke) === null || _a === void 0 ? void 0 : _a.color;
            return (!particle.destroyed &&
                !particle.spawning &&
                !!color &&
                ((((_b = particle.strokeColor) === null || _b === void 0 ? void 0 : _b.h.value) !== undefined && color.animation.h.enable) ||
                    (((_c = particle.strokeColor) === null || _c === void 0 ? void 0 : _c.s.value) !== undefined && color.animation.s.enable) ||
                    (((_d = particle.strokeColor) === null || _d === void 0 ? void 0 : _d.l.value) !== undefined && color.animation.l.enable)));
        }
        update(particle, delta) {
            if (!this.isEnabled(particle)) {
                return;
            }
            updateStrokeColor(particle, delta);
        }
    }
    exports.StrokeColorUpdater = StrokeColorUpdater;
    });

    unwrapExports(StrokeColorUpdater_1);
    StrokeColorUpdater_1.StrokeColorUpdater;

    var StrokeColor = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadStrokeColorUpdater = void 0;

    async function loadStrokeColorUpdater(tsParticles) {
        await tsParticles.addParticleUpdater("strokeColor", (container) => new StrokeColorUpdater_1.StrokeColorUpdater(container));
    }
    exports.loadStrokeColorUpdater = loadStrokeColorUpdater;
    });

    unwrapExports(StrokeColor);
    StrokeColor.loadStrokeColorUpdater;

    var ColorUpdater_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ColorUpdater = void 0;


    function updateColorValue(delta, value, valueAnimation, max, decrease) {
        var _a;
        const colorValue = value;
        if (!colorValue || !valueAnimation.enable) {
            return;
        }
        const offset = (0, Utils$2.randomInRange)(valueAnimation.offset);
        const velocity = ((_a = value.velocity) !== null && _a !== void 0 ? _a : 0) * delta.factor + offset * 3.6;
        if (!decrease || colorValue.status === Enums$3.AnimationStatus.increasing) {
            colorValue.value += velocity;
            if (decrease && colorValue.value > max) {
                colorValue.status = Enums$3.AnimationStatus.decreasing;
                colorValue.value -= colorValue.value % max;
            }
        }
        else {
            colorValue.value -= velocity;
            if (colorValue.value < 0) {
                colorValue.status = Enums$3.AnimationStatus.increasing;
                colorValue.value += colorValue.value;
            }
        }
        if (colorValue.value > max) {
            colorValue.value %= max;
        }
    }
    function updateColor(particle, delta) {
        var _a, _b, _c;
        const animationOptions = particle.options.color.animation;
        if (((_a = particle.color) === null || _a === void 0 ? void 0 : _a.h) !== undefined) {
            updateColorValue(delta, particle.color.h, animationOptions.h, 360, false);
        }
        if (((_b = particle.color) === null || _b === void 0 ? void 0 : _b.s) !== undefined) {
            updateColorValue(delta, particle.color.s, animationOptions.s, 100, true);
        }
        if (((_c = particle.color) === null || _c === void 0 ? void 0 : _c.l) !== undefined) {
            updateColorValue(delta, particle.color.l, animationOptions.l, 100, true);
        }
    }
    class ColorUpdater {
        constructor(container) {
            this.container = container;
        }
        init(particle) {
            const hslColor = (0, Utils$2.colorToHsl)(particle.options.color, particle.id, particle.options.reduceDuplicates);
            if (hslColor) {
                particle.color = (0, Utils$2.getHslAnimationFromHsl)(hslColor, particle.options.color.animation, this.container.retina.reduceFactor);
            }
        }
        isEnabled(particle) {
            var _a, _b, _c;
            const animationOptions = particle.options.color.animation;
            return (!particle.destroyed &&
                !particle.spawning &&
                ((((_a = particle.color) === null || _a === void 0 ? void 0 : _a.h.value) !== undefined && animationOptions.h.enable) ||
                    (((_b = particle.color) === null || _b === void 0 ? void 0 : _b.s.value) !== undefined && animationOptions.s.enable) ||
                    (((_c = particle.color) === null || _c === void 0 ? void 0 : _c.l.value) !== undefined && animationOptions.l.enable)));
        }
        update(particle, delta) {
            updateColor(particle, delta);
        }
    }
    exports.ColorUpdater = ColorUpdater;
    });

    unwrapExports(ColorUpdater_1);
    ColorUpdater_1.ColorUpdater;

    var Color = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadColorUpdater = void 0;

    async function loadColorUpdater(tsParticles) {
        await tsParticles.addParticleUpdater("color", (container) => new ColorUpdater_1.ColorUpdater(container));
    }
    exports.loadColorUpdater = loadColorUpdater;
    });

    unwrapExports(Color);
    Color.loadColorUpdater;

    var Collider_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Collider = void 0;



    function bounce(p1, p2) {
        (0, Utils$2.circleBounce)((0, Utils$2.circleBounceDataFromParticle)(p1), (0, Utils$2.circleBounceDataFromParticle)(p2));
    }
    function destroy(p1, p2) {
        if (!p1.unbreakable && !p2.unbreakable) {
            bounce(p1, p2);
        }
        if (p1.getRadius() === undefined && p2.getRadius() !== undefined) {
            p1.destroy();
        }
        else if (p1.getRadius() !== undefined && p2.getRadius() === undefined) {
            p2.destroy();
        }
        else if (p1.getRadius() !== undefined && p2.getRadius() !== undefined) {
            if (p1.getRadius() >= p2.getRadius()) {
                p2.destroy();
            }
            else {
                p1.destroy();
            }
        }
    }
    class Collider extends ParticlesInteractorBase_1.ParticlesInteractorBase {
        constructor(container) {
            super(container);
        }
        isEnabled(particle) {
            return particle.options.collisions.enable;
        }
        reset() {
        }
        interact(p1) {
            const container = this.container;
            const pos1 = p1.getPosition();
            const radius1 = p1.getRadius();
            const query = container.particles.quadTree.queryCircle(pos1, radius1 * 2);
            for (const p2 of query) {
                if (p1 === p2 ||
                    !p2.options.collisions.enable ||
                    p1.options.collisions.mode !== p2.options.collisions.mode ||
                    p2.destroyed ||
                    p2.spawning) {
                    continue;
                }
                const pos2 = p2.getPosition();
                if (Math.round(pos1.z) !== Math.round(pos2.z)) {
                    continue;
                }
                const dist = (0, Utils$2.getDistance)(pos1, pos2);
                const radius2 = p2.getRadius();
                const distP = radius1 + radius2;
                if (dist <= distP) {
                    this.resolveCollision(p1, p2);
                }
            }
        }
        resolveCollision(p1, p2) {
            switch (p1.options.collisions.mode) {
                case Enums$3.CollisionMode.absorb: {
                    this.absorb(p1, p2);
                    break;
                }
                case Enums$3.CollisionMode.bounce: {
                    bounce(p1, p2);
                    break;
                }
                case Enums$3.CollisionMode.destroy: {
                    destroy(p1, p2);
                    break;
                }
            }
        }
        absorb(p1, p2) {
            const container = this.container;
            const fps = container.fpsLimit / 1000;
            if (p1.getRadius() === undefined && p2.getRadius() !== undefined) {
                p1.destroy();
            }
            else if (p1.getRadius() !== undefined && p2.getRadius() === undefined) {
                p2.destroy();
            }
            else if (p1.getRadius() !== undefined && p2.getRadius() !== undefined) {
                if (p1.getRadius() >= p2.getRadius()) {
                    const factor = (0, Utils$2.clamp)(p1.getRadius() / p2.getRadius(), 0, p2.getRadius()) * fps;
                    p1.size.value += factor;
                    p2.size.value -= factor;
                    if (p2.getRadius() <= container.retina.pixelRatio) {
                        p2.size.value = 0;
                        p2.destroy();
                    }
                }
                else {
                    const factor = (0, Utils$2.clamp)(p2.getRadius() / p1.getRadius(), 0, p1.getRadius()) * fps;
                    p1.size.value -= factor;
                    p2.size.value += factor;
                    if (p1.getRadius() <= container.retina.pixelRatio) {
                        p1.size.value = 0;
                        p1.destroy();
                    }
                }
            }
        }
    }
    exports.Collider = Collider;
    });

    unwrapExports(Collider_1);
    Collider_1.Collider;

    var Collisions = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadParticlesCollisionsInteraction = void 0;

    async function loadParticlesCollisionsInteraction(tsParticles) {
        await tsParticles.addInteractor("particlesCollisions", (container) => new Collider_1.Collider(container));
    }
    exports.loadParticlesCollisionsInteraction = loadParticlesCollisionsInteraction;
    });

    unwrapExports(Collisions);
    Collisions.loadParticlesCollisionsInteraction;

    var AngleUpdater_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AngleUpdater = void 0;


    function updateAngle(particle, delta) {
        var _a;
        const rotate = particle.rotate;
        if (!rotate) {
            return;
        }
        const rotateOptions = particle.options.rotate;
        const rotateAnimation = rotateOptions.animation;
        const speed = ((_a = rotate.velocity) !== null && _a !== void 0 ? _a : 0) * delta.factor;
        const max = 2 * Math.PI;
        if (!rotateAnimation.enable) {
            return;
        }
        switch (rotate.status) {
            case Enums$3.AnimationStatus.increasing:
                rotate.value += speed;
                if (rotate.value > max) {
                    rotate.value -= max;
                }
                break;
            case Enums$3.AnimationStatus.decreasing:
            default:
                rotate.value -= speed;
                if (rotate.value < 0) {
                    rotate.value += max;
                }
                break;
        }
    }
    class AngleUpdater {
        constructor(container) {
            this.container = container;
        }
        init(particle) {
            const rotateOptions = particle.options.rotate;
            particle.rotate = {
                enable: rotateOptions.animation.enable,
                value: ((0, Utils$2.getRangeValue)(rotateOptions.value) * Math.PI) / 180,
            };
            let rotateDirection = rotateOptions.direction;
            if (rotateDirection === Enums$3.RotateDirection.random) {
                const index = Math.floor(Math.random() * 2);
                rotateDirection = index > 0 ? Enums$3.RotateDirection.counterClockwise : Enums$3.RotateDirection.clockwise;
            }
            switch (rotateDirection) {
                case Enums$3.RotateDirection.counterClockwise:
                case "counterClockwise":
                    particle.rotate.status = Enums$3.AnimationStatus.decreasing;
                    break;
                case Enums$3.RotateDirection.clockwise:
                    particle.rotate.status = Enums$3.AnimationStatus.increasing;
                    break;
            }
            const rotateAnimation = particle.options.rotate.animation;
            if (rotateAnimation.enable) {
                particle.rotate.velocity = (rotateAnimation.speed / 360) * this.container.retina.reduceFactor;
                if (!rotateAnimation.sync) {
                    particle.rotate.velocity *= Math.random();
                }
            }
        }
        isEnabled(particle) {
            const rotate = particle.options.rotate;
            const rotateAnimation = rotate.animation;
            return !particle.destroyed && !particle.spawning && !rotate.path && rotateAnimation.enable;
        }
        update(particle, delta) {
            if (!this.isEnabled(particle)) {
                return;
            }
            updateAngle(particle, delta);
        }
    }
    exports.AngleUpdater = AngleUpdater;
    });

    unwrapExports(AngleUpdater_1);
    AngleUpdater_1.AngleUpdater;

    var Angle = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadAngleUpdater = void 0;

    async function loadAngleUpdater(tsParticles) {
        await tsParticles.addParticleUpdater("angle", (container) => new AngleUpdater_1.AngleUpdater(container));
    }
    exports.loadAngleUpdater = loadAngleUpdater;
    });

    unwrapExports(Angle);
    Angle.loadAngleUpdater;

    var Utils = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.bounceVertical = exports.bounceHorizontal = void 0;


    function bounceHorizontal(data) {
        if (!(data.outMode === Enums$3.OutMode.bounce ||
            data.outMode === Enums$3.OutMode.bounceHorizontal ||
            data.outMode === "bounceHorizontal" ||
            data.outMode === Enums$3.OutMode.split)) {
            return;
        }
        const velocity = data.particle.velocity.x;
        let bounced = false;
        if ((data.direction === Enums$3.OutModeDirection.right && data.bounds.right >= data.canvasSize.width && velocity > 0) ||
            (data.direction === Enums$3.OutModeDirection.left && data.bounds.left <= 0 && velocity < 0)) {
            const newVelocity = (0, Utils$2.getRangeValue)(data.particle.options.bounce.horizontal.value);
            data.particle.velocity.x *= -newVelocity;
            bounced = true;
        }
        if (!bounced) {
            return;
        }
        const minPos = data.offset.x + data.size;
        if (data.bounds.right >= data.canvasSize.width) {
            data.particle.position.x = data.canvasSize.width - minPos;
        }
        else if (data.bounds.left <= 0) {
            data.particle.position.x = minPos;
        }
        if (data.outMode === Enums$3.OutMode.split) {
            data.particle.destroy();
        }
    }
    exports.bounceHorizontal = bounceHorizontal;
    function bounceVertical(data) {
        if (data.outMode === Enums$3.OutMode.bounce ||
            data.outMode === Enums$3.OutMode.bounceVertical ||
            data.outMode === "bounceVertical" ||
            data.outMode === Enums$3.OutMode.split) {
            const velocity = data.particle.velocity.y;
            let bounced = false;
            if ((data.direction === Enums$3.OutModeDirection.bottom &&
                data.bounds.bottom >= data.canvasSize.height &&
                velocity > 0) ||
                (data.direction === Enums$3.OutModeDirection.top && data.bounds.top <= 0 && velocity < 0)) {
                const newVelocity = (0, Utils$2.getRangeValue)(data.particle.options.bounce.vertical.value);
                data.particle.velocity.y *= -newVelocity;
                bounced = true;
            }
            if (!bounced) {
                return;
            }
            const minPos = data.offset.y + data.size;
            if (data.bounds.bottom >= data.canvasSize.height) {
                data.particle.position.y = data.canvasSize.height - minPos;
            }
            else if (data.bounds.top <= 0) {
                data.particle.position.y = minPos;
            }
            if (data.outMode === Enums$3.OutMode.split) {
                data.particle.destroy();
            }
        }
    }
    exports.bounceVertical = bounceVertical;
    });

    unwrapExports(Utils);
    Utils.bounceVertical;
    Utils.bounceHorizontal;

    var OutOfCanvasUpdater_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.OutOfCanvasUpdater = void 0;



    class OutOfCanvasUpdater {
        constructor(container) {
            this.container = container;
        }
        init() {
        }
        isEnabled(particle) {
            return !particle.destroyed && !particle.spawning;
        }
        update(particle, delta) {
            var _a, _b, _c, _d;
            const outModes = particle.options.move.outModes;
            this.updateOutMode(particle, delta, (_a = outModes.bottom) !== null && _a !== void 0 ? _a : outModes.default, Enums$3.OutModeDirection.bottom);
            this.updateOutMode(particle, delta, (_b = outModes.left) !== null && _b !== void 0 ? _b : outModes.default, Enums$3.OutModeDirection.left);
            this.updateOutMode(particle, delta, (_c = outModes.right) !== null && _c !== void 0 ? _c : outModes.default, Enums$3.OutModeDirection.right);
            this.updateOutMode(particle, delta, (_d = outModes.top) !== null && _d !== void 0 ? _d : outModes.default, Enums$3.OutModeDirection.top);
        }
        updateOutMode(particle, delta, outMode, direction) {
            switch (outMode) {
                case Enums$3.OutMode.bounce:
                case Enums$3.OutMode.bounceVertical:
                case Enums$3.OutMode.bounceHorizontal:
                case "bounceVertical":
                case "bounceHorizontal":
                case Enums$3.OutMode.split:
                    this.bounce(particle, delta, direction, outMode);
                    break;
                case Enums$3.OutMode.destroy:
                    this.destroy(particle, direction);
                    break;
                case Enums$3.OutMode.out:
                    this.out(particle, direction);
                    break;
                case Enums$3.OutMode.none:
                default:
                    this.none(particle, direction);
                    break;
            }
        }
        destroy(particle, direction) {
            const container = this.container;
            if ((0, Utils$2.isPointInside)(particle.position, container.canvas.size, particle.getRadius(), direction)) {
                return;
            }
            container.particles.remove(particle, undefined, true);
        }
        out(particle, direction) {
            const container = this.container;
            if ((0, Utils$2.isPointInside)(particle.position, container.canvas.size, particle.getRadius(), direction)) {
                return;
            }
            const wrap = particle.options.move.warp, canvasSize = container.canvas.size, newPos = {
                bottom: canvasSize.height + particle.getRadius() + particle.offset.y,
                left: -particle.getRadius() - particle.offset.x,
                right: canvasSize.width + particle.getRadius() + particle.offset.x,
                top: -particle.getRadius() - particle.offset.y,
            }, sizeValue = particle.getRadius(), nextBounds = (0, Utils$2.calculateBounds)(particle.position, sizeValue);
            if (direction === Enums$3.OutModeDirection.right && nextBounds.left > canvasSize.width + particle.offset.x) {
                particle.position.x = newPos.left;
                particle.initialPosition.x = particle.position.x;
                if (!wrap) {
                    particle.position.y = Math.random() * canvasSize.height;
                    particle.initialPosition.y = particle.position.y;
                }
            }
            else if (direction === Enums$3.OutModeDirection.left && nextBounds.right < -particle.offset.x) {
                particle.position.x = newPos.right;
                particle.initialPosition.x = particle.position.x;
                if (!wrap) {
                    particle.position.y = Math.random() * canvasSize.height;
                    particle.initialPosition.y = particle.position.y;
                }
            }
            if (direction === Enums$3.OutModeDirection.bottom && nextBounds.top > canvasSize.height + particle.offset.y) {
                if (!wrap) {
                    particle.position.x = Math.random() * canvasSize.width;
                    particle.initialPosition.x = particle.position.x;
                }
                particle.position.y = newPos.top;
                particle.initialPosition.y = particle.position.y;
            }
            else if (direction === Enums$3.OutModeDirection.top && nextBounds.bottom < -particle.offset.y) {
                if (!wrap) {
                    particle.position.x = Math.random() * canvasSize.width;
                    particle.initialPosition.x = particle.position.x;
                }
                particle.position.y = newPos.bottom;
                particle.initialPosition.y = particle.position.y;
            }
        }
        bounce(particle, delta, direction, outMode) {
            const container = this.container;
            let handled = false;
            for (const [, plugin] of container.plugins) {
                if (plugin.particleBounce !== undefined) {
                    handled = plugin.particleBounce(particle, delta, direction);
                }
                if (handled) {
                    break;
                }
            }
            if (handled) {
                return;
            }
            const pos = particle.getPosition(), offset = particle.offset, size = particle.getRadius(), bounds = (0, Utils$2.calculateBounds)(pos, size), canvasSize = container.canvas.size;
            (0, Utils.bounceHorizontal)({ particle, outMode, direction, bounds, canvasSize, offset, size });
            (0, Utils.bounceVertical)({ particle, outMode, direction, bounds, canvasSize, offset, size });
        }
        none(particle, direction) {
            if ((particle.options.move.distance.horizontal &&
                (direction === Enums$3.OutModeDirection.left || direction === Enums$3.OutModeDirection.right)) ||
                (particle.options.move.distance.vertical &&
                    (direction === Enums$3.OutModeDirection.top || direction === Enums$3.OutModeDirection.bottom))) {
                return;
            }
            const gravityOptions = particle.options.move.gravity, container = this.container;
            const canvasSize = container.canvas.size;
            const pRadius = particle.getRadius();
            if (!gravityOptions.enable) {
                if ((particle.velocity.y > 0 && particle.position.y <= canvasSize.height + pRadius) ||
                    (particle.velocity.y < 0 && particle.position.y >= -pRadius) ||
                    (particle.velocity.x > 0 && particle.position.x <= canvasSize.width + pRadius) ||
                    (particle.velocity.x < 0 && particle.position.x >= -pRadius)) {
                    return;
                }
                if (!(0, Utils$2.isPointInside)(particle.position, container.canvas.size, pRadius, direction)) {
                    container.particles.remove(particle);
                }
            }
            else {
                const position = particle.position;
                if ((!gravityOptions.inverse &&
                    position.y > canvasSize.height + pRadius &&
                    direction === Enums$3.OutModeDirection.bottom) ||
                    (gravityOptions.inverse && position.y < -pRadius && direction === Enums$3.OutModeDirection.top)) {
                    container.particles.remove(particle);
                }
            }
        }
    }
    exports.OutOfCanvasUpdater = OutOfCanvasUpdater;
    });

    unwrapExports(OutOfCanvasUpdater_1);
    OutOfCanvasUpdater_1.OutOfCanvasUpdater;

    var OutModes = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadOutModesUpdater = void 0;

    async function loadOutModesUpdater(tsParticles) {
        await tsParticles.addParticleUpdater("outModes", (container) => new OutOfCanvasUpdater_1.OutOfCanvasUpdater(container));
    }
    exports.loadOutModesUpdater = loadOutModesUpdater;
    });

    unwrapExports(OutModes);
    OutModes.loadOutModesUpdater;

    var Repulser_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Repulser = void 0;




    class Repulser extends ExternalInteractorBase_1.ExternalInteractorBase {
        constructor(container) {
            super(container);
        }
        isEnabled() {
            const container = this.container, options = container.actualOptions, mouse = container.interactivity.mouse, events = options.interactivity.events, divs = events.onDiv, divRepulse = (0, Utils$2.isDivModeEnabled)(Enums$3.DivMode.repulse, divs);
            if (!(divRepulse || (events.onHover.enable && mouse.position) || (events.onClick.enable && mouse.clickPosition))) {
                return false;
            }
            const hoverMode = events.onHover.mode, clickMode = events.onClick.mode;
            return (0, Utils$2.isInArray)(Enums$3.HoverMode.repulse, hoverMode) || (0, Utils$2.isInArray)(Enums$3.ClickMode.repulse, clickMode) || divRepulse;
        }
        reset() {
        }
        interact() {
            const container = this.container, options = container.actualOptions, mouseMoveStatus = container.interactivity.status === Utils$2.Constants.mouseMoveEvent, events = options.interactivity.events, hoverEnabled = events.onHover.enable, hoverMode = events.onHover.mode, clickEnabled = events.onClick.enable, clickMode = events.onClick.mode, divs = events.onDiv;
            if (mouseMoveStatus && hoverEnabled && (0, Utils$2.isInArray)(Enums$3.HoverMode.repulse, hoverMode)) {
                this.hoverRepulse();
            }
            else if (clickEnabled && (0, Utils$2.isInArray)(Enums$3.ClickMode.repulse, clickMode)) {
                this.clickRepulse();
            }
            else {
                (0, Utils$2.divModeExecute)(Enums$3.DivMode.repulse, divs, (selector, div) => this.singleSelectorRepulse(selector, div));
            }
        }
        singleSelectorRepulse(selector, div) {
            const container = this.container, query = document.querySelectorAll(selector);
            if (!query.length) {
                return;
            }
            query.forEach((item) => {
                const elem = item, pxRatio = container.retina.pixelRatio, pos = {
                    x: (elem.offsetLeft + elem.offsetWidth / 2) * pxRatio,
                    y: (elem.offsetTop + elem.offsetHeight / 2) * pxRatio,
                }, repulseRadius = (elem.offsetWidth / 2) * pxRatio, area = div.type === Enums$3.DivType.circle
                    ? new Utils$2.Circle(pos.x, pos.y, repulseRadius)
                    : new Utils$2.Rectangle(elem.offsetLeft * pxRatio, elem.offsetTop * pxRatio, elem.offsetWidth * pxRatio, elem.offsetHeight * pxRatio), divs = container.actualOptions.interactivity.modes.repulse.divs, divRepulse = (0, Utils$2.divMode)(divs, elem);
                this.processRepulse(pos, repulseRadius, area, divRepulse);
            });
        }
        hoverRepulse() {
            const container = this.container, mousePos = container.interactivity.mouse.position;
            if (!mousePos) {
                return;
            }
            const repulseRadius = container.retina.repulseModeDistance;
            this.processRepulse(mousePos, repulseRadius, new Utils$2.Circle(mousePos.x, mousePos.y, repulseRadius));
        }
        processRepulse(position, repulseRadius, area, divRepulse) {
            var _a;
            const container = this.container, query = container.particles.quadTree.query(area), repulseOptions = container.actualOptions.interactivity.modes.repulse;
            for (const particle of query) {
                const { dx, dy, distance } = (0, Utils$2.getDistances)(particle.position, position), velocity = ((_a = divRepulse === null || divRepulse === void 0 ? void 0 : divRepulse.speed) !== null && _a !== void 0 ? _a : repulseOptions.speed) * repulseOptions.factor, repulseFactor = (0, Utils$2.clamp)((0, Utils$2.calcEasing)(1 - distance / repulseRadius, repulseOptions.easing) * velocity, 0, repulseOptions.maxSpeed), normVec = Vector_1.Vector.create(distance === 0 ? velocity : (dx / distance) * repulseFactor, distance === 0 ? velocity : (dy / distance) * repulseFactor);
                particle.position.addTo(normVec);
            }
        }
        clickRepulse() {
            const container = this.container;
            if (!container.repulse.finish) {
                if (!container.repulse.count) {
                    container.repulse.count = 0;
                }
                container.repulse.count++;
                if (container.repulse.count === container.particles.count) {
                    container.repulse.finish = true;
                }
            }
            if (container.repulse.clicking) {
                const repulseDistance = container.retina.repulseModeDistance, repulseRadius = Math.pow(repulseDistance / 6, 3), mouseClickPos = container.interactivity.mouse.clickPosition;
                if (mouseClickPos === undefined) {
                    return;
                }
                const range = new Utils$2.Circle(mouseClickPos.x, mouseClickPos.y, repulseRadius), query = container.particles.quadTree.query(range);
                for (const particle of query) {
                    const { dx, dy, distance } = (0, Utils$2.getDistances)(mouseClickPos, particle.position), d = distance ** 2, velocity = container.actualOptions.interactivity.modes.repulse.speed, force = (-repulseRadius * velocity) / d;
                    if (d <= repulseRadius) {
                        container.repulse.particles.push(particle);
                        const vect = Vector_1.Vector.create(dx, dy);
                        vect.length = force;
                        particle.velocity.setTo(vect);
                    }
                }
            }
            else if (container.repulse.clicking === false) {
                for (const particle of container.repulse.particles) {
                    particle.velocity.setTo(particle.initialVelocity);
                }
                container.repulse.particles = [];
            }
        }
    }
    exports.Repulser = Repulser;
    });

    unwrapExports(Repulser_1);
    Repulser_1.Repulser;

    var Repulse = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadExternalRepulseInteraction = void 0;

    async function loadExternalRepulseInteraction(tsParticles) {
        await tsParticles.addInteractor("externalRepulse", (container) => new Repulser_1.Repulser(container));
    }
    exports.loadExternalRepulseInteraction = loadExternalRepulseInteraction;
    });

    unwrapExports(Repulse);
    Repulse.loadExternalRepulseInteraction;

    var LineDrawer_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.LineDrawer = void 0;
    class LineDrawer {
        getSidesCount() {
            return 1;
        }
        draw(context, particle, radius) {
            context.moveTo(-radius / 2, 0);
            context.lineTo(radius / 2, 0);
        }
    }
    exports.LineDrawer = LineDrawer;
    });

    unwrapExports(LineDrawer_1);
    LineDrawer_1.LineDrawer;

    var Line = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadLineShape = void 0;

    async function loadLineShape(tsParticles) {
        await tsParticles.addShape("line", new LineDrawer_1.LineDrawer());
    }
    exports.loadLineShape = loadLineShape;
    });

    unwrapExports(Line);
    Line.loadLineShape;

    var Bouncer_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Bouncer = void 0;




    class Bouncer extends ExternalInteractorBase_1.ExternalInteractorBase {
        constructor(container) {
            super(container);
        }
        isEnabled() {
            const container = this.container, options = container.actualOptions, mouse = container.interactivity.mouse, events = options.interactivity.events, divs = events.onDiv;
            return ((mouse.position && events.onHover.enable && (0, Utils$2.isInArray)(Enums$3.HoverMode.bounce, events.onHover.mode)) ||
                (0, Utils$2.isDivModeEnabled)(Enums$3.DivMode.bounce, divs));
        }
        interact() {
            const container = this.container, options = container.actualOptions, events = options.interactivity.events, mouseMoveStatus = container.interactivity.status === Utils$2.Constants.mouseMoveEvent, hoverEnabled = events.onHover.enable, hoverMode = events.onHover.mode, divs = events.onDiv;
            if (mouseMoveStatus && hoverEnabled && (0, Utils$2.isInArray)(Enums$3.HoverMode.bounce, hoverMode)) {
                this.processMouseBounce();
            }
            else {
                (0, Utils$2.divModeExecute)(Enums$3.DivMode.bounce, divs, (selector, div) => this.singleSelectorBounce(selector, div));
            }
        }
        reset() {
        }
        processMouseBounce() {
            const container = this.container, pxRatio = container.retina.pixelRatio, tolerance = 10 * pxRatio, mousePos = container.interactivity.mouse.position, radius = container.retina.bounceModeDistance;
            if (mousePos) {
                this.processBounce(mousePos, radius, new Utils$2.Circle(mousePos.x, mousePos.y, radius + tolerance));
            }
        }
        singleSelectorBounce(selector, div) {
            const container = this.container;
            const query = document.querySelectorAll(selector);
            if (!query.length) {
                return;
            }
            query.forEach((item) => {
                const elem = item, pxRatio = container.retina.pixelRatio, pos = {
                    x: (elem.offsetLeft + elem.offsetWidth / 2) * pxRatio,
                    y: (elem.offsetTop + elem.offsetHeight / 2) * pxRatio,
                }, radius = (elem.offsetWidth / 2) * pxRatio, tolerance = 10 * pxRatio;
                const area = div.type === Enums$3.DivType.circle
                    ? new Utils$2.Circle(pos.x, pos.y, radius + tolerance)
                    : new Utils$2.Rectangle(elem.offsetLeft * pxRatio - tolerance, elem.offsetTop * pxRatio - tolerance, elem.offsetWidth * pxRatio + tolerance * 2, elem.offsetHeight * pxRatio + tolerance * 2);
                this.processBounce(pos, radius, area);
            });
        }
        processBounce(position, radius, area) {
            const query = this.container.particles.quadTree.query(area);
            for (const particle of query) {
                if (area instanceof Utils$2.Circle) {
                    (0, Utils$2.circleBounce)((0, Utils$2.circleBounceDataFromParticle)(particle), {
                        position,
                        radius,
                        mass: (radius ** 2 * Math.PI) / 2,
                        velocity: Vector_1.Vector.origin,
                        factor: Vector_1.Vector.origin,
                    });
                }
                else if (area instanceof Utils$2.Rectangle) {
                    (0, Utils$2.rectBounce)(particle, (0, Utils$2.calculateBounds)(position, radius));
                }
            }
        }
    }
    exports.Bouncer = Bouncer;
    });

    unwrapExports(Bouncer_1);
    Bouncer_1.Bouncer;

    var Bounce = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadExternalBounceInteraction = void 0;

    async function loadExternalBounceInteraction(tsParticles) {
        await tsParticles.addInteractor("externalBounce", (container) => new Bouncer_1.Bouncer(container));
    }
    exports.loadExternalBounceInteraction = loadExternalBounceInteraction;
    });

    unwrapExports(Bounce);
    Bounce.loadExternalBounceInteraction;

    var TextDrawer_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.TextDrawer = exports.validTypes = void 0;

    exports.validTypes = ["text", "character", "char"];
    class TextDrawer {
        getSidesCount() {
            return 12;
        }
        async init(container) {
            const options = container.actualOptions;
            if (exports.validTypes.find((t) => (0, Utils$2.isInArray)(t, options.particles.shape.type))) {
                const shapeOptions = exports.validTypes.map((t) => options.particles.shape.options[t]).find((t) => !!t);
                if (shapeOptions instanceof Array) {
                    const promises = [];
                    for (const character of shapeOptions) {
                        promises.push((0, Utils$2.loadFont)(character));
                    }
                    await Promise.allSettled(promises);
                }
                else {
                    if (shapeOptions !== undefined) {
                        await (0, Utils$2.loadFont)(shapeOptions);
                    }
                }
            }
        }
        draw(context, particle, radius, opacity) {
            var _a, _b, _c;
            const character = particle.shapeData;
            if (character === undefined) {
                return;
            }
            const textData = character.value;
            if (textData === undefined) {
                return;
            }
            const textParticle = particle;
            if (textParticle.text === undefined) {
                textParticle.text =
                    textData instanceof Array ? (0, Utils$2.itemFromArray)(textData, particle.randomIndexData) : textData;
            }
            const text = textParticle.text;
            const style = (_a = character.style) !== null && _a !== void 0 ? _a : "";
            const weight = (_b = character.weight) !== null && _b !== void 0 ? _b : "400";
            const size = Math.round(radius) * 2;
            const font = (_c = character.font) !== null && _c !== void 0 ? _c : "Verdana";
            const fill = particle.fill;
            const offsetX = (text.length * radius) / 2;
            context.font = `${style} ${weight} ${size}px "${font}"`;
            const pos = {
                x: -offsetX,
                y: radius / 2,
            };
            context.globalAlpha = opacity;
            if (fill) {
                context.fillText(text, pos.x, pos.y);
            }
            else {
                context.strokeText(text, pos.x, pos.y);
            }
            context.globalAlpha = 1;
        }
    }
    exports.TextDrawer = TextDrawer;
    });

    unwrapExports(TextDrawer_1);
    TextDrawer_1.TextDrawer;
    TextDrawer_1.validTypes;

    var Text = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadTextShape = void 0;

    async function loadTextShape(tsParticles) {
        const drawer = new TextDrawer_1.TextDrawer();
        for (const type of TextDrawer_1.validTypes) {
            await tsParticles.addShape(type, drawer);
        }
    }
    exports.loadTextShape = loadTextShape;
    });

    unwrapExports(Text);
    Text.loadTextShape;

    var Linker_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Linker = void 0;


    function getLinkDistance(pos1, pos2, optDistance, canvasSize, warp) {
        let distance = (0, Utils$2.getDistance)(pos1, pos2);
        if (!warp || distance <= optDistance) {
            return distance;
        }
        const pos2NE = {
            x: pos2.x - canvasSize.width,
            y: pos2.y,
        };
        distance = (0, Utils$2.getDistance)(pos1, pos2NE);
        if (distance <= optDistance) {
            return distance;
        }
        const pos2SE = {
            x: pos2.x - canvasSize.width,
            y: pos2.y - canvasSize.height,
        };
        distance = (0, Utils$2.getDistance)(pos1, pos2SE);
        if (distance <= optDistance) {
            return distance;
        }
        const pos2SW = {
            x: pos2.x,
            y: pos2.y - canvasSize.height,
        };
        distance = (0, Utils$2.getDistance)(pos1, pos2SW);
        return distance;
    }
    class Linker extends ParticlesInteractorBase_1.ParticlesInteractorBase {
        constructor(container) {
            super(container);
        }
        isEnabled(particle) {
            return particle.options.links.enable;
        }
        reset() {
        }
        interact(p1) {
            var _a;
            p1.links = [];
            const pos1 = p1.getPosition();
            const container = this.container;
            const canvasSize = container.canvas.size;
            if (pos1.x < 0 || pos1.y < 0 || pos1.x > canvasSize.width || pos1.y > canvasSize.height) {
                return;
            }
            const linkOpt1 = p1.options.links;
            const optOpacity = linkOpt1.opacity;
            const optDistance = (_a = p1.retina.linksDistance) !== null && _a !== void 0 ? _a : container.retina.linksDistance;
            const warp = linkOpt1.warp;
            const range = warp
                ? new Utils$2.CircleWarp(pos1.x, pos1.y, optDistance, canvasSize)
                : new Utils$2.Circle(pos1.x, pos1.y, optDistance);
            const query = container.particles.quadTree.query(range);
            for (const p2 of query) {
                const linkOpt2 = p2.options.links;
                if (p1 === p2 ||
                    !linkOpt2.enable ||
                    linkOpt1.id !== linkOpt2.id ||
                    p2.spawning ||
                    p2.destroyed ||
                    p1.links.map((t) => t.destination).indexOf(p2) !== -1 ||
                    p2.links.map((t) => t.destination).indexOf(p1) !== -1) {
                    continue;
                }
                const pos2 = p2.getPosition();
                if (pos2.x < 0 || pos2.y < 0 || pos2.x > canvasSize.width || pos2.y > canvasSize.height) {
                    continue;
                }
                const distance = getLinkDistance(pos1, pos2, optDistance, canvasSize, warp && linkOpt2.warp);
                if (distance > optDistance) {
                    return;
                }
                const opacityLine = (1 - distance / optDistance) * optOpacity;
                this.setColor(p1);
                p1.links.push({
                    destination: p2,
                    opacity: opacityLine,
                });
            }
        }
        setColor(p1) {
            const container = this.container;
            const linksOptions = p1.options.links;
            let linkColor = linksOptions.id === undefined
                ? container.particles.linksColor
                : container.particles.linksColors.get(linksOptions.id);
            if (!linkColor) {
                const optColor = linksOptions.color;
                linkColor = (0, Utils$2.getLinkRandomColor)(optColor, linksOptions.blink, linksOptions.consent);
                if (linksOptions.id === undefined) {
                    container.particles.linksColor = linkColor;
                }
                else {
                    container.particles.linksColors.set(linksOptions.id, linkColor);
                }
            }
        }
    }
    exports.Linker = Linker;
    });

    unwrapExports(Linker_1);
    Linker_1.Linker;

    var LinkInstance_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.LinkInstance = void 0;

    class LinkInstance {
        constructor(container) {
            this.container = container;
        }
        particleCreated(particle) {
            const linkParticle = particle;
            linkParticle.links = [];
        }
        particleDestroyed(particle) {
            const linkParticle = particle;
            linkParticle.links = [];
        }
        drawParticle(context, particle) {
            const linkParticle = particle;
            const container = this.container;
            const particles = container.particles;
            const pOptions = particle.options;
            if (linkParticle.links.length > 0) {
                context.save();
                const p1Links = linkParticle.links.filter((l) => {
                    const linkFreq = container.particles.getLinkFrequency(linkParticle, l.destination);
                    return linkFreq <= pOptions.links.frequency;
                });
                for (const link of p1Links) {
                    const p2 = link.destination;
                    if (pOptions.links.triangles.enable) {
                        const links = p1Links.map((l) => l.destination);
                        const vertices = p2.links.filter((t) => {
                            const linkFreq = container.particles.getLinkFrequency(p2, t.destination);
                            return linkFreq <= p2.options.links.frequency && links.indexOf(t.destination) >= 0;
                        });
                        if (vertices.length) {
                            for (const vertex of vertices) {
                                const p3 = vertex.destination;
                                const triangleFreq = particles.getTriangleFrequency(linkParticle, p2, p3);
                                if (triangleFreq > pOptions.links.triangles.frequency) {
                                    continue;
                                }
                                this.drawLinkTriangle(linkParticle, link, vertex);
                            }
                        }
                    }
                    if (link.opacity > 0 && container.retina.linksWidth > 0) {
                        this.drawLinkLine(linkParticle, link);
                    }
                }
                context.restore();
            }
        }
        drawLinkTriangle(p1, link1, link2) {
            var _a;
            const container = this.container;
            const options = container.actualOptions;
            const p2 = link1.destination;
            const p3 = link2.destination;
            const triangleOptions = p1.options.links.triangles;
            const opacityTriangle = (_a = triangleOptions.opacity) !== null && _a !== void 0 ? _a : (link1.opacity + link2.opacity) / 2;
            if (opacityTriangle <= 0) {
                return;
            }
            const pos1 = p1.getPosition();
            const pos2 = p2.getPosition();
            const pos3 = p3.getPosition();
            container.canvas.draw((ctx) => {
                if ((0, Utils$2.getDistance)(pos1, pos2) > container.retina.linksDistance ||
                    (0, Utils$2.getDistance)(pos3, pos2) > container.retina.linksDistance ||
                    (0, Utils$2.getDistance)(pos3, pos1) > container.retina.linksDistance) {
                    return;
                }
                let colorTriangle = (0, Utils$2.colorToRgb)(triangleOptions.color);
                if (!colorTriangle) {
                    const linksOptions = p1.options.links;
                    const linkColor = linksOptions.id !== undefined
                        ? container.particles.linksColors.get(linksOptions.id)
                        : container.particles.linksColor;
                    colorTriangle = (0, Utils$2.getLinkColor)(p1, p2, linkColor);
                }
                if (!colorTriangle) {
                    return;
                }
                (0, Utils$2.drawLinkTriangle)(ctx, pos1, pos2, pos3, options.backgroundMask.enable, options.backgroundMask.composite, colorTriangle, opacityTriangle);
            });
        }
        drawLinkLine(p1, link) {
            const container = this.container;
            const options = container.actualOptions;
            const p2 = link.destination;
            let opacity = link.opacity;
            const pos1 = p1.getPosition();
            const pos2 = p2.getPosition();
            container.canvas.draw((ctx) => {
                var _a, _b;
                let colorLine;
                const twinkle = p1.options.twinkle.lines;
                if (twinkle.enable) {
                    const twinkleFreq = twinkle.frequency;
                    const twinkleRgb = (0, Utils$2.colorToRgb)(twinkle.color);
                    const twinkling = Math.random() < twinkleFreq;
                    if (twinkling && twinkleRgb !== undefined) {
                        colorLine = twinkleRgb;
                        opacity = twinkle.opacity;
                    }
                }
                if (!colorLine) {
                    const linksOptions = p1.options.links;
                    const linkColor = linksOptions.id !== undefined
                        ? container.particles.linksColors.get(linksOptions.id)
                        : container.particles.linksColor;
                    colorLine = (0, Utils$2.getLinkColor)(p1, p2, linkColor);
                }
                if (!colorLine) {
                    return;
                }
                const width = (_a = p1.retina.linksWidth) !== null && _a !== void 0 ? _a : container.retina.linksWidth;
                const maxDistance = (_b = p1.retina.linksDistance) !== null && _b !== void 0 ? _b : container.retina.linksDistance;
                (0, Utils$2.drawLinkLine)(ctx, width, pos1, pos2, maxDistance, container.canvas.size, p1.options.links.warp, options.backgroundMask.enable, options.backgroundMask.composite, colorLine, opacity, p1.options.links.shadow);
            });
        }
    }
    exports.LinkInstance = LinkInstance;
    });

    unwrapExports(LinkInstance_1);
    LinkInstance_1.LinkInstance;

    var plugin$3 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadPlugin = void 0;

    class Plugin {
        constructor() {
            this.id = "links";
        }
        getPlugin(container) {
            return new LinkInstance_1.LinkInstance(container);
        }
        needsPlugin() {
            return true;
        }
        loadOptions() {
        }
    }
    async function loadPlugin(tsParticles) {
        const plugin = new Plugin();
        await tsParticles.addPlugin(plugin);
    }
    exports.loadPlugin = loadPlugin;
    });

    unwrapExports(plugin$3);
    plugin$3.loadPlugin;

    var Links = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadParticlesLinksInteraction = exports.loadInteraction = void 0;


    async function loadInteraction(tsParticles) {
        await tsParticles.addInteractor("particlesLinks", (container) => new Linker_1.Linker(container));
    }
    exports.loadInteraction = loadInteraction;
    async function loadParticlesLinksInteraction(tsParticles) {
        await loadInteraction(tsParticles);
        await (0, plugin$3.loadPlugin)(tsParticles);
    }
    exports.loadParticlesLinksInteraction = loadParticlesLinksInteraction;
    });

    unwrapExports(Links);
    Links.loadParticlesLinksInteraction;
    Links.loadInteraction;

    var SizeUpdater_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SizeUpdater = void 0;


    function checkDestroy(particle, value, minValue, maxValue) {
        switch (particle.options.size.animation.destroy) {
            case Enums$3.DestroyType.max:
                if (value >= maxValue) {
                    particle.destroy();
                }
                break;
            case Enums$3.DestroyType.min:
                if (value <= minValue) {
                    particle.destroy();
                }
                break;
        }
    }
    function updateSize(particle, delta) {
        var _a, _b, _c, _d;
        const sizeVelocity = ((_a = particle.size.velocity) !== null && _a !== void 0 ? _a : 0) * delta.factor;
        const minValue = particle.size.min;
        const maxValue = particle.size.max;
        if (!(!particle.destroyed &&
            particle.size.enable &&
            (((_b = particle.size.loops) !== null && _b !== void 0 ? _b : 0) <= 0 || ((_c = particle.size.loops) !== null && _c !== void 0 ? _c : 0) < ((_d = particle.size.maxLoops) !== null && _d !== void 0 ? _d : 0)))) {
            return;
        }
        switch (particle.size.status) {
            case Enums$3.AnimationStatus.increasing:
                if (particle.size.value >= maxValue) {
                    particle.size.status = Enums$3.AnimationStatus.decreasing;
                    if (!particle.size.loops) {
                        particle.size.loops = 0;
                    }
                    particle.size.loops++;
                }
                else {
                    particle.size.value += sizeVelocity;
                }
                break;
            case Enums$3.AnimationStatus.decreasing:
                if (particle.size.value <= minValue) {
                    particle.size.status = Enums$3.AnimationStatus.increasing;
                    if (!particle.size.loops) {
                        particle.size.loops = 0;
                    }
                    particle.size.loops++;
                }
                else {
                    particle.size.value -= sizeVelocity;
                }
        }
        checkDestroy(particle, particle.size.value, minValue, maxValue);
        if (!particle.destroyed) {
            particle.size.value = (0, Utils$2.clamp)(particle.size.value, minValue, maxValue);
        }
    }
    class SizeUpdater {
        init() {
        }
        isEnabled(particle) {
            var _a, _b, _c;
            return (!particle.destroyed &&
                !particle.spawning &&
                particle.size.enable &&
                (((_a = particle.size.loops) !== null && _a !== void 0 ? _a : 0) <= 0 || ((_b = particle.size.loops) !== null && _b !== void 0 ? _b : 0) < ((_c = particle.size.maxLoops) !== null && _c !== void 0 ? _c : 0)));
        }
        update(particle, delta) {
            if (!this.isEnabled(particle)) {
                return;
            }
            updateSize(particle, delta);
        }
    }
    exports.SizeUpdater = SizeUpdater;
    });

    unwrapExports(SizeUpdater_1);
    SizeUpdater_1.SizeUpdater;

    var Size = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadSizeUpdater = void 0;

    async function loadSizeUpdater(tsParticles) {
        await tsParticles.addParticleUpdater("size", () => new SizeUpdater_1.SizeUpdater());
    }
    exports.loadSizeUpdater = loadSizeUpdater;
    });

    unwrapExports(Size);
    Size.loadSizeUpdater;

    var slim = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadSlim = void 0;























    async function loadSlim(tsParticles) {
        await (0, Attract$1.loadExternalAttractInteraction)(tsParticles);
        await (0, Bounce.loadExternalBounceInteraction)(tsParticles);
        await (0, Bubble.loadExternalBubbleInteraction)(tsParticles);
        await (0, Connect.loadExternalConnectInteraction)(tsParticles);
        await (0, Grab.loadExternalGrabInteraction)(tsParticles);
        await (0, Repulse.loadExternalRepulseInteraction)(tsParticles);
        await (0, Attract.loadParticlesAttractInteraction)(tsParticles);
        await (0, Collisions.loadParticlesCollisionsInteraction)(tsParticles);
        await (0, Links.loadParticlesLinksInteraction)(tsParticles);
        await (0, Circle.loadCircleShape)(tsParticles);
        await (0, Image$1.loadImageShape)(tsParticles);
        await (0, Line.loadLineShape)(tsParticles);
        await (0, Polygon.loadPolygonShape)(tsParticles);
        await (0, Square.loadSquareShape)(tsParticles);
        await (0, Star.loadStarShape)(tsParticles);
        await (0, Text.loadTextShape)(tsParticles);
        await (0, Life.loadLifeUpdater)(tsParticles);
        await (0, Opacity.loadOpacityUpdater)(tsParticles);
        await (0, Size.loadSizeUpdater)(tsParticles);
        await (0, Angle.loadAngleUpdater)(tsParticles);
        await (0, Color.loadColorUpdater)(tsParticles);
        await (0, StrokeColor.loadStrokeColorUpdater)(tsParticles);
        await (0, OutModes.loadOutModesUpdater)(tsParticles);
    }
    exports.loadSlim = loadSlim;
    });

    unwrapExports(slim);
    slim.loadSlim;

    var TrailMaker_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.TrailMaker = void 0;



    class TrailMaker extends ExternalInteractorBase_1.ExternalInteractorBase {
        constructor(container) {
            super(container);
            this.delay = 0;
        }
        interact(delta) {
            var _a, _b, _c, _d;
            if (!this.container.retina.reduceFactor) {
                return;
            }
            const container = this.container, options = container.actualOptions, trailOptions = options.interactivity.modes.trail, optDelay = (trailOptions.delay * 1000) / this.container.retina.reduceFactor;
            if (this.delay < optDelay) {
                this.delay += delta.value;
            }
            if (this.delay < optDelay) {
                return;
            }
            let canEmit = true;
            if (trailOptions.pauseOnStop) {
                if (container.interactivity.mouse.position === this.lastPosition ||
                    (((_a = container.interactivity.mouse.position) === null || _a === void 0 ? void 0 : _a.x) === ((_b = this.lastPosition) === null || _b === void 0 ? void 0 : _b.x) &&
                        ((_c = container.interactivity.mouse.position) === null || _c === void 0 ? void 0 : _c.y) === ((_d = this.lastPosition) === null || _d === void 0 ? void 0 : _d.y))) {
                    canEmit = false;
                }
            }
            if (container.interactivity.mouse.position) {
                this.lastPosition = {
                    x: container.interactivity.mouse.position.x,
                    y: container.interactivity.mouse.position.y,
                };
            }
            else {
                delete this.lastPosition;
            }
            if (canEmit) {
                container.particles.push(trailOptions.quantity, container.interactivity.mouse, trailOptions.particles);
            }
            this.delay -= optDelay;
        }
        isEnabled() {
            const container = this.container, options = container.actualOptions, mouse = container.interactivity.mouse, events = options.interactivity.events;
            return ((mouse.clicking && mouse.inside && !!mouse.position && (0, Utils$2.isInArray)(Enums$3.ClickMode.trail, events.onClick.mode)) ||
                (mouse.inside && !!mouse.position && (0, Utils$2.isInArray)(Enums$3.HoverMode.trail, events.onHover.mode)));
        }
        reset() {
        }
    }
    exports.TrailMaker = TrailMaker;
    });

    unwrapExports(TrailMaker_1);
    TrailMaker_1.TrailMaker;

    var Trail = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadExternalTrailInteraction = void 0;

    async function loadExternalTrailInteraction(tsParticles) {
        await tsParticles.addInteractor("externalTrail", (container) => new TrailMaker_1.TrailMaker(container));
    }
    exports.loadExternalTrailInteraction = loadExternalTrailInteraction;
    });

    unwrapExports(Trail);
    Trail.loadExternalTrailInteraction;

    var TiltUpdater_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.TiltUpdater = void 0;


    function updateTilt(particle, delta) {
        var _a;
        if (!particle.tilt) {
            return;
        }
        const tilt = particle.options.tilt;
        const tiltAnimation = tilt.animation;
        const speed = ((_a = particle.tilt.velocity) !== null && _a !== void 0 ? _a : 0) * delta.factor;
        const max = 2 * Math.PI;
        if (!tiltAnimation.enable) {
            return;
        }
        switch (particle.tilt.status) {
            case Enums$3.AnimationStatus.increasing:
                particle.tilt.value += speed;
                if (particle.tilt.value > max) {
                    particle.tilt.value -= max;
                }
                break;
            case Enums$3.AnimationStatus.decreasing:
            default:
                particle.tilt.value -= speed;
                if (particle.tilt.value < 0) {
                    particle.tilt.value += max;
                }
                break;
        }
    }
    class TiltUpdater {
        constructor(container) {
            this.container = container;
        }
        init(particle) {
            const tiltOptions = particle.options.tilt;
            particle.tilt = {
                enable: tiltOptions.enable,
                value: ((0, Utils$2.getRangeValue)(tiltOptions.value) * Math.PI) / 180,
                sinDirection: Math.random() >= 0.5 ? 1 : -1,
                cosDirection: Math.random() >= 0.5 ? 1 : -1,
            };
            let tiltDirection = tiltOptions.direction;
            if (tiltDirection === Enums$3.TiltDirection.random) {
                const index = Math.floor(Math.random() * 2);
                tiltDirection = index > 0 ? Enums$3.TiltDirection.counterClockwise : Enums$3.TiltDirection.clockwise;
            }
            switch (tiltDirection) {
                case Enums$3.TiltDirection.counterClockwise:
                case "counterClockwise":
                    particle.tilt.status = Enums$3.AnimationStatus.decreasing;
                    break;
                case Enums$3.TiltDirection.clockwise:
                    particle.tilt.status = Enums$3.AnimationStatus.increasing;
                    break;
            }
            const tiltAnimation = particle.options.tilt.animation;
            if (tiltAnimation.enable) {
                particle.tilt.velocity = (tiltAnimation.speed / 360) * this.container.retina.reduceFactor;
                if (!tiltAnimation.sync) {
                    particle.tilt.velocity *= Math.random();
                }
            }
        }
        isEnabled(particle) {
            const tilt = particle.options.tilt;
            const tiltAnimation = tilt.animation;
            return !particle.destroyed && !particle.spawning && tiltAnimation.enable;
        }
        update(particle, delta) {
            if (!this.isEnabled(particle)) {
                return;
            }
            updateTilt(particle, delta);
        }
    }
    exports.TiltUpdater = TiltUpdater;
    });

    unwrapExports(TiltUpdater_1);
    TiltUpdater_1.TiltUpdater;

    var Tilt = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadTiltUpdater = void 0;

    async function loadTiltUpdater(tsParticles) {
        await tsParticles.addParticleUpdater("tilt", (container) => new TiltUpdater_1.TiltUpdater(container));
    }
    exports.loadTiltUpdater = loadTiltUpdater;
    });

    unwrapExports(Tilt);
    Tilt.loadTiltUpdater;

    var WobbleUpdater_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.WobbleUpdater = void 0;

    function updateWobble(particle, delta) {
        var _a;
        const wobble = particle.options.wobble;
        if (!wobble.enable || !particle.wobble) {
            return;
        }
        const speed = particle.wobble.speed * delta.factor;
        const distance = (((_a = particle.retina.wobbleDistance) !== null && _a !== void 0 ? _a : 0) * delta.factor) / (1000 / 60);
        const max = 2 * Math.PI;
        particle.wobble.angle += speed;
        if (particle.wobble.angle > max) {
            particle.wobble.angle -= max;
        }
        particle.position.x += distance * Math.cos(particle.wobble.angle);
        particle.position.y += distance * Math.abs(Math.sin(particle.wobble.angle));
    }
    class WobbleUpdater {
        constructor(container) {
            this.container = container;
        }
        init(particle) {
            const wobbleOpt = particle.options.wobble;
            if (wobbleOpt.enable) {
                particle.wobble = {
                    angle: Math.random() * Math.PI * 2,
                    speed: (0, Utils$2.getRangeValue)(wobbleOpt.speed) / 360,
                };
            }
            else {
                particle.wobble = {
                    angle: 0,
                    speed: 0,
                };
            }
            particle.retina.wobbleDistance = (0, Utils$2.getRangeValue)(wobbleOpt.distance) * this.container.retina.pixelRatio;
        }
        isEnabled(particle) {
            return !particle.destroyed && !particle.spawning && particle.options.wobble.enable;
        }
        update(particle, delta) {
            if (!this.isEnabled(particle)) {
                return;
            }
            updateWobble(particle, delta);
        }
    }
    exports.WobbleUpdater = WobbleUpdater;
    });

    unwrapExports(WobbleUpdater_1);
    WobbleUpdater_1.WobbleUpdater;

    var Wobble = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadWobbleUpdater = void 0;

    async function loadWobbleUpdater(tsParticles) {
        await tsParticles.addParticleUpdater("wobble", (container) => new WobbleUpdater_1.WobbleUpdater(container));
    }
    exports.loadWobbleUpdater = loadWobbleUpdater;
    });

    unwrapExports(Wobble);
    Wobble.loadWobbleUpdater;

    var AbsorberInstance_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AbsorberInstance = void 0;



    class AbsorberInstance {
        constructor(absorbers, container, options, position) {
            var _a, _b, _c, _d, _e;
            this.absorbers = absorbers;
            this.container = container;
            this.initialPosition = position ? Vector_1.Vector.create(position.x, position.y) : undefined;
            this.options = options;
            this.dragging = false;
            this.name = this.options.name;
            this.opacity = this.options.opacity;
            this.size = (0, Utils$2.getRangeValue)(options.size.value) * container.retina.pixelRatio;
            this.mass = this.size * options.size.density * container.retina.reduceFactor;
            const limit = options.size.limit;
            this.limit =
                typeof limit === "number"
                    ? {
                        radius: limit * container.retina.pixelRatio * container.retina.reduceFactor,
                        mass: 0,
                    }
                    : {
                        radius: ((_a = limit === null || limit === void 0 ? void 0 : limit.radius) !== null && _a !== void 0 ? _a : 0) * container.retina.pixelRatio * container.retina.reduceFactor,
                        mass: (_b = limit === null || limit === void 0 ? void 0 : limit.mass) !== null && _b !== void 0 ? _b : 0,
                    };
            const color = typeof options.color === "string" ? { value: options.color } : options.color;
            this.color = (_c = (0, Utils$2.colorToRgb)(color)) !== null && _c !== void 0 ? _c : {
                b: 0,
                g: 0,
                r: 0,
            };
            this.position = (_e = (_d = this.initialPosition) === null || _d === void 0 ? void 0 : _d.copy()) !== null && _e !== void 0 ? _e : this.calcPosition();
        }
        attract(particle) {
            const container = this.container;
            const options = this.options;
            if (options.draggable) {
                const mouse = container.interactivity.mouse;
                if (mouse.clicking && mouse.downPosition) {
                    const mouseDist = (0, Utils$2.getDistance)(this.position, mouse.downPosition);
                    if (mouseDist <= this.size) {
                        this.dragging = true;
                    }
                }
                else {
                    this.dragging = false;
                }
                if (this.dragging && mouse.position) {
                    this.position.x = mouse.position.x;
                    this.position.y = mouse.position.y;
                }
            }
            const pos = particle.getPosition();
            const { dx, dy, distance } = (0, Utils$2.getDistances)(this.position, pos);
            const v = Vector_1.Vector.create(dx, dy);
            v.length = (this.mass / Math.pow(distance, 2)) * container.retina.reduceFactor;
            if (distance < this.size + particle.getRadius()) {
                const sizeFactor = particle.getRadius() * 0.033 * container.retina.pixelRatio;
                if ((this.size > particle.getRadius() && distance < this.size - particle.getRadius()) ||
                    (particle.absorberOrbit !== undefined && particle.absorberOrbit.length < 0)) {
                    if (options.destroy) {
                        particle.destroy();
                    }
                    else {
                        particle.needsNewPosition = true;
                        this.updateParticlePosition(particle, v);
                    }
                }
                else {
                    if (options.destroy) {
                        particle.size.value -= sizeFactor;
                    }
                    this.updateParticlePosition(particle, v);
                }
                if (this.limit.radius <= 0 || this.size < this.limit.radius) {
                    this.size += sizeFactor;
                }
                if (this.limit.mass <= 0 || this.mass < this.limit.mass) {
                    this.mass += sizeFactor * this.options.size.density * container.retina.reduceFactor;
                }
            }
            else {
                this.updateParticlePosition(particle, v);
            }
        }
        resize() {
            const initialPosition = this.initialPosition;
            this.position =
                initialPosition && (0, Utils$2.isPointInside)(initialPosition, this.container.canvas.size)
                    ? initialPosition
                    : this.calcPosition();
        }
        draw(context) {
            context.translate(this.position.x, this.position.y);
            context.beginPath();
            context.arc(0, 0, this.size, 0, Math.PI * 2, false);
            context.closePath();
            context.fillStyle = (0, Utils$2.getStyleFromRgb)(this.color, this.opacity);
            context.fill();
        }
        calcPosition() {
            var _a, _b;
            const container = this.container;
            const percentPosition = this.options.position;
            return Vector_1.Vector.create((((_a = percentPosition === null || percentPosition === void 0 ? void 0 : percentPosition.x) !== null && _a !== void 0 ? _a : Math.random() * 100) / 100) * container.canvas.size.width, (((_b = percentPosition === null || percentPosition === void 0 ? void 0 : percentPosition.y) !== null && _b !== void 0 ? _b : Math.random() * 100) / 100) * container.canvas.size.height);
        }
        updateParticlePosition(particle, v) {
            var _a;
            if (particle.destroyed) {
                return;
            }
            const container = this.container;
            const canvasSize = container.canvas.size;
            if (particle.needsNewPosition) {
                particle.position.x = Math.floor(Math.random() * canvasSize.width);
                particle.position.y = Math.floor(Math.random() * canvasSize.height);
                particle.velocity.setTo(particle.initialVelocity);
                particle.absorberOrbit = undefined;
                particle.needsNewPosition = false;
            }
            if (this.options.orbits) {
                if (particle.absorberOrbit === undefined) {
                    particle.absorberOrbit = Vector_1.Vector.create(0, 0);
                    particle.absorberOrbit.length = (0, Utils$2.getDistance)(particle.getPosition(), this.position);
                    particle.absorberOrbit.angle = Math.random() * Math.PI * 2;
                }
                if (particle.absorberOrbit.length <= this.size && !this.options.destroy) {
                    const minSize = Math.min(canvasSize.width, canvasSize.height);
                    particle.absorberOrbit.length = minSize * (1 + (Math.random() * 0.2 - 0.1));
                }
                if (particle.absorberOrbitDirection === undefined) {
                    particle.absorberOrbitDirection =
                        particle.velocity.x >= 0 ? Enums$3.RotateDirection.clockwise : Enums$3.RotateDirection.counterClockwise;
                }
                const orbitRadius = particle.absorberOrbit.length;
                const orbitAngle = particle.absorberOrbit.angle;
                const orbitDirection = particle.absorberOrbitDirection;
                particle.velocity.x = 0;
                particle.velocity.y = 0;
                const updateFunc = {
                    x: orbitDirection === Enums$3.RotateDirection.clockwise ? Math.cos : Math.sin,
                    y: orbitDirection === Enums$3.RotateDirection.clockwise ? Math.sin : Math.cos,
                };
                particle.position.x = this.position.x + orbitRadius * updateFunc.x(orbitAngle);
                particle.position.y = this.position.y + orbitRadius * updateFunc.y(orbitAngle);
                particle.absorberOrbit.length -= v.length;
                particle.absorberOrbit.angle +=
                    ((((_a = particle.retina.moveSpeed) !== null && _a !== void 0 ? _a : 0) * container.retina.pixelRatio) / 100) *
                        container.retina.reduceFactor;
            }
            else {
                const addV = Vector_1.Vector.origin;
                addV.length = v.length;
                addV.angle = v.angle;
                particle.velocity.addTo(addV);
            }
        }
    }
    exports.AbsorberInstance = AbsorberInstance;
    });

    unwrapExports(AbsorberInstance_1);
    AbsorberInstance_1.AbsorberInstance;

    var AbsorberSizeLimit_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AbsorberSizeLimit = void 0;
    class AbsorberSizeLimit {
        constructor() {
            this.radius = 0;
            this.mass = 0;
        }
        load(data) {
            if (!data) {
                return;
            }
            if (data.mass !== undefined) {
                this.mass = data.mass;
            }
            if (data.radius !== undefined) {
                this.radius = data.radius;
            }
        }
    }
    exports.AbsorberSizeLimit = AbsorberSizeLimit;
    });

    unwrapExports(AbsorberSizeLimit_1);
    AbsorberSizeLimit_1.AbsorberSizeLimit;

    var AbsorberSize_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AbsorberSize = void 0;


    class AbsorberSize extends ValueWithRandom_1.ValueWithRandom {
        constructor() {
            super();
            this.density = 5;
            this.random.minimumValue = 1;
            this.value = 50;
            this.limit = new AbsorberSizeLimit_1.AbsorberSizeLimit();
        }
        load(data) {
            if (!data) {
                return;
            }
            super.load(data);
            if (data.density !== undefined) {
                this.density = data.density;
            }
            if (typeof data.limit === "number") {
                this.limit.radius = data.limit;
            }
            else {
                this.limit.load(data.limit);
            }
        }
    }
    exports.AbsorberSize = AbsorberSize;
    });

    unwrapExports(AbsorberSize_1);
    AbsorberSize_1.AbsorberSize;

    var Absorber_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Absorber = void 0;


    class Absorber {
        constructor() {
            this.color = new OptionsColor_1.OptionsColor();
            this.color.value = "#000000";
            this.draggable = false;
            this.opacity = 1;
            this.destroy = true;
            this.orbits = false;
            this.size = new AbsorberSize_1.AbsorberSize();
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.color !== undefined) {
                this.color = OptionsColor_1.OptionsColor.create(this.color, data.color);
            }
            if (data.draggable !== undefined) {
                this.draggable = data.draggable;
            }
            this.name = data.name;
            if (data.opacity !== undefined) {
                this.opacity = data.opacity;
            }
            if (data.position !== undefined) {
                this.position = {
                    x: data.position.x,
                    y: data.position.y,
                };
            }
            if (data.size !== undefined) {
                this.size.load(data.size);
            }
            if (data.destroy !== undefined) {
                this.destroy = data.destroy;
            }
            if (data.orbits !== undefined) {
                this.orbits = data.orbits;
            }
        }
    }
    exports.Absorber = Absorber;
    });

    unwrapExports(Absorber_1);
    Absorber_1.Absorber;

    var AbsorberClickMode_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AbsorberClickMode = void 0;
    (function (AbsorberClickMode) {
        AbsorberClickMode["absorber"] = "absorber";
    })(exports.AbsorberClickMode || (exports.AbsorberClickMode = {}));
    });

    unwrapExports(AbsorberClickMode_1);
    AbsorberClickMode_1.AbsorberClickMode;

    var Enums$2 = createCommonjsModule(function (module, exports) {
    var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
    }) : (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
    }));
    var __exportStar = (commonjsGlobal && commonjsGlobal.__exportStar) || function(m, exports) {
        for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    __exportStar(AbsorberClickMode_1, exports);
    });

    unwrapExports(Enums$2);

    var Absorbers_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Absorbers = void 0;




    class Absorbers {
        constructor(container) {
            this.container = container;
            this.array = [];
            this.absorbers = [];
            this.interactivityAbsorbers = [];
            const overridableContainer = container;
            overridableContainer.getAbsorber = (idxOrName) => idxOrName === undefined || typeof idxOrName === "number"
                ? this.array[idxOrName || 0]
                : this.array.find((t) => t.name === idxOrName);
            overridableContainer.addAbsorber = (options, position) => this.addAbsorber(options, position);
        }
        init(options) {
            var _a, _b;
            if (!options) {
                return;
            }
            if (options.absorbers) {
                if (options.absorbers instanceof Array) {
                    this.absorbers = options.absorbers.map((s) => {
                        const tmp = new Absorber_1.Absorber();
                        tmp.load(s);
                        return tmp;
                    });
                }
                else {
                    if (this.absorbers instanceof Array) {
                        this.absorbers = new Absorber_1.Absorber();
                    }
                    this.absorbers.load(options.absorbers);
                }
            }
            const interactivityAbsorbers = (_b = (_a = options.interactivity) === null || _a === void 0 ? void 0 : _a.modes) === null || _b === void 0 ? void 0 : _b.absorbers;
            if (interactivityAbsorbers) {
                if (interactivityAbsorbers instanceof Array) {
                    this.interactivityAbsorbers = interactivityAbsorbers.map((s) => {
                        const tmp = new Absorber_1.Absorber();
                        tmp.load(s);
                        return tmp;
                    });
                }
                else {
                    if (this.interactivityAbsorbers instanceof Array) {
                        this.interactivityAbsorbers = new Absorber_1.Absorber();
                    }
                    this.interactivityAbsorbers.load(interactivityAbsorbers);
                }
            }
            if (this.absorbers instanceof Array) {
                for (const absorberOptions of this.absorbers) {
                    this.addAbsorber(absorberOptions);
                }
            }
            else {
                this.addAbsorber(this.absorbers);
            }
        }
        particleUpdate(particle) {
            for (const absorber of this.array) {
                absorber.attract(particle);
                if (particle.destroyed) {
                    break;
                }
            }
        }
        draw(context) {
            for (const absorber of this.array) {
                context.save();
                absorber.draw(context);
                context.restore();
            }
        }
        stop() {
            this.array = [];
        }
        resize() {
            for (const absorber of this.array) {
                absorber.resize();
            }
        }
        handleClickMode(mode) {
            const container = this.container;
            const absorberOptions = this.absorbers;
            const modeAbsorbers = this.interactivityAbsorbers;
            if (mode === Enums$2.AbsorberClickMode.absorber) {
                let absorbersModeOptions;
                if (modeAbsorbers instanceof Array) {
                    if (modeAbsorbers.length > 0) {
                        absorbersModeOptions = (0, Utils$2.itemFromArray)(modeAbsorbers);
                    }
                }
                else {
                    absorbersModeOptions = modeAbsorbers;
                }
                const absorbersOptions = absorbersModeOptions !== null && absorbersModeOptions !== void 0 ? absorbersModeOptions : (absorberOptions instanceof Array ? (0, Utils$2.itemFromArray)(absorberOptions) : absorberOptions);
                const aPosition = container.interactivity.mouse.clickPosition;
                this.addAbsorber(absorbersOptions, aPosition);
            }
        }
        addAbsorber(options, position) {
            const absorber = new AbsorberInstance_1.AbsorberInstance(this, this.container, options, position);
            this.array.push(absorber);
            return absorber;
        }
        removeAbsorber(absorber) {
            const index = this.array.indexOf(absorber);
            if (index >= 0) {
                this.array.splice(index, 1);
            }
        }
    }
    exports.Absorbers = Absorbers;
    });

    unwrapExports(Absorbers_1);
    Absorbers_1.Absorbers;

    var plugin$2 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadAbsorbersPlugin = void 0;




    class Plugin {
        constructor() {
            this.id = "absorbers";
        }
        getPlugin(container) {
            return new Absorbers_1.Absorbers(container);
        }
        needsPlugin(options) {
            var _a, _b, _c;
            if (options === undefined) {
                return false;
            }
            const absorbers = options.absorbers;
            let loadAbsorbers = false;
            if (absorbers instanceof Array) {
                if (absorbers.length) {
                    loadAbsorbers = true;
                }
            }
            else if (absorbers !== undefined) {
                loadAbsorbers = true;
            }
            else if (((_c = (_b = (_a = options.interactivity) === null || _a === void 0 ? void 0 : _a.events) === null || _b === void 0 ? void 0 : _b.onClick) === null || _c === void 0 ? void 0 : _c.mode) &&
                (0, Utils$2.isInArray)(Enums$2.AbsorberClickMode.absorber, options.interactivity.events.onClick.mode)) {
                loadAbsorbers = true;
            }
            return loadAbsorbers;
        }
        loadOptions(options, source) {
            var _a, _b;
            if (!this.needsPlugin(options) && !this.needsPlugin(source)) {
                return;
            }
            const optionsCast = options;
            if (source === null || source === void 0 ? void 0 : source.absorbers) {
                if ((source === null || source === void 0 ? void 0 : source.absorbers) instanceof Array) {
                    optionsCast.absorbers = source === null || source === void 0 ? void 0 : source.absorbers.map((s) => {
                        const tmp = new Absorber_1.Absorber();
                        tmp.load(s);
                        return tmp;
                    });
                }
                else {
                    let absorberOptions = optionsCast.absorbers;
                    if ((absorberOptions === null || absorberOptions === void 0 ? void 0 : absorberOptions.load) === undefined) {
                        optionsCast.absorbers = absorberOptions = new Absorber_1.Absorber();
                    }
                    absorberOptions.load(source === null || source === void 0 ? void 0 : source.absorbers);
                }
            }
            const interactivityAbsorbers = (_b = (_a = source === null || source === void 0 ? void 0 : source.interactivity) === null || _a === void 0 ? void 0 : _a.modes) === null || _b === void 0 ? void 0 : _b.absorbers;
            if (interactivityAbsorbers) {
                if (interactivityAbsorbers instanceof Array) {
                    optionsCast.interactivity.modes.absorbers = interactivityAbsorbers.map((s) => {
                        const tmp = new Absorber_1.Absorber();
                        tmp.load(s);
                        return tmp;
                    });
                }
                else {
                    let absorberOptions = optionsCast.interactivity.modes.absorbers;
                    if ((absorberOptions === null || absorberOptions === void 0 ? void 0 : absorberOptions.load) === undefined) {
                        optionsCast.interactivity.modes.absorbers = absorberOptions = new Absorber_1.Absorber();
                    }
                    absorberOptions.load(interactivityAbsorbers);
                }
            }
        }
    }
    async function loadAbsorbersPlugin(tsParticles) {
        const plugin = new Plugin();
        await tsParticles.addPlugin(plugin);
    }
    exports.loadAbsorbersPlugin = loadAbsorbersPlugin;
    });

    unwrapExports(plugin$2);
    plugin$2.loadAbsorbersPlugin;

    var EmitterSize_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.EmitterSize = void 0;

    class EmitterSize {
        constructor() {
            this.mode = Enums$3.SizeMode.percent;
            this.height = 0;
            this.width = 0;
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.mode !== undefined) {
                this.mode = data.mode;
            }
            if (data.height !== undefined) {
                this.height = data.height;
            }
            if (data.width !== undefined) {
                this.width = data.width;
            }
        }
    }
    exports.EmitterSize = EmitterSize;
    });

    unwrapExports(EmitterSize_1);
    EmitterSize_1.EmitterSize;

    var ShapeManager_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ShapeManager = void 0;
    const shapes = new Map();
    class ShapeManager {
        static addShape(name, drawer) {
            if (!ShapeManager.getShape(name)) {
                shapes.set(name, drawer);
            }
        }
        static getShape(name) {
            return shapes.get(name);
        }
        static getSupportedShapes() {
            return shapes.keys();
        }
    }
    exports.ShapeManager = ShapeManager;
    });

    unwrapExports(ShapeManager_1);
    ShapeManager_1.ShapeManager;

    var EmitterInstance_1 = createCommonjsModule(function (module, exports) {
    var __classPrivateFieldSet = (commonjsGlobal && commonjsGlobal.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
        if (kind === "m") throw new TypeError("Private method is not writable");
        if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
        if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
        return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
    };
    var __classPrivateFieldGet = (commonjsGlobal && commonjsGlobal.__classPrivateFieldGet) || function (receiver, state, kind, f) {
        if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
        if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
        return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
    };
    var _EmitterInstance_firstSpawn, _EmitterInstance_startParticlesAdded;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.EmitterInstance = void 0;




    class EmitterInstance {
        constructor(emitters, container, emitterOptions, position) {
            var _a, _b, _c, _d, _e, _f;
            var _g;
            this.emitters = emitters;
            this.container = container;
            _EmitterInstance_firstSpawn.set(this, void 0);
            _EmitterInstance_startParticlesAdded.set(this, void 0);
            this.currentDuration = 0;
            this.currentEmitDelay = 0;
            this.currentSpawnDelay = 0;
            this.initialPosition = position;
            this.emitterOptions = (0, Utils$2.deepExtend)({}, emitterOptions);
            this.spawnDelay = (((_a = this.emitterOptions.life.delay) !== null && _a !== void 0 ? _a : 0) * 1000) / this.container.retina.reduceFactor;
            this.position = (_b = this.initialPosition) !== null && _b !== void 0 ? _b : this.calcPosition();
            this.name = emitterOptions.name;
            this.shape = ShapeManager_1.ShapeManager.getShape(emitterOptions.shape);
            this.fill = emitterOptions.fill;
            __classPrivateFieldSet(this, _EmitterInstance_firstSpawn, !this.emitterOptions.life.wait, "f");
            __classPrivateFieldSet(this, _EmitterInstance_startParticlesAdded, false, "f");
            let particlesOptions = (0, Utils$2.deepExtend)({}, this.emitterOptions.particles);
            particlesOptions !== null && particlesOptions !== void 0 ? particlesOptions : (particlesOptions = {});
            (_c = particlesOptions.move) !== null && _c !== void 0 ? _c : (particlesOptions.move = {});
            (_d = (_g = particlesOptions.move).direction) !== null && _d !== void 0 ? _d : (_g.direction = this.emitterOptions.direction);
            if (this.emitterOptions.spawnColor !== undefined) {
                this.spawnColor = (0, Utils$2.colorToHsl)(this.emitterOptions.spawnColor);
            }
            this.paused = !this.emitterOptions.autoPlay;
            this.particlesOptions = particlesOptions;
            this.size =
                (_e = this.emitterOptions.size) !== null && _e !== void 0 ? _e : (() => {
                    const size = new EmitterSize_1.EmitterSize();
                    size.load({
                        height: 0,
                        mode: Enums$3.SizeMode.percent,
                        width: 0,
                    });
                    return size;
                })();
            this.lifeCount = (_f = this.emitterOptions.life.count) !== null && _f !== void 0 ? _f : -1;
            this.immortal = this.lifeCount <= 0;
            this.play();
        }
        externalPlay() {
            this.paused = false;
            this.play();
        }
        externalPause() {
            this.paused = true;
            this.pause();
        }
        play() {
            var _a;
            if (this.paused) {
                return;
            }
            if (this.container.retina.reduceFactor &&
                (this.lifeCount > 0 || this.immortal || !this.emitterOptions.life.count) &&
                (__classPrivateFieldGet(this, _EmitterInstance_firstSpawn, "f") || this.currentSpawnDelay >= ((_a = this.spawnDelay) !== null && _a !== void 0 ? _a : 0))) {
                if (this.emitDelay === undefined) {
                    const delay = (0, Utils$2.getRangeValue)(this.emitterOptions.rate.delay);
                    this.emitDelay = (1000 * delay) / this.container.retina.reduceFactor;
                }
                if (this.lifeCount > 0 || this.immortal) {
                    this.prepareToDie();
                }
            }
        }
        pause() {
            if (this.paused) {
                return;
            }
            delete this.emitDelay;
        }
        resize() {
            const initialPosition = this.initialPosition;
            this.position =
                initialPosition && (0, Utils$2.isPointInside)(initialPosition, this.container.canvas.size)
                    ? initialPosition
                    : this.calcPosition();
        }
        update(delta) {
            var _a, _b, _c;
            if (this.paused) {
                return;
            }
            if (__classPrivateFieldGet(this, _EmitterInstance_firstSpawn, "f")) {
                __classPrivateFieldSet(this, _EmitterInstance_firstSpawn, false, "f");
                this.currentSpawnDelay = (_a = this.spawnDelay) !== null && _a !== void 0 ? _a : 0;
                this.currentEmitDelay = (_b = this.emitDelay) !== null && _b !== void 0 ? _b : 0;
            }
            if (!__classPrivateFieldGet(this, _EmitterInstance_startParticlesAdded, "f")) {
                __classPrivateFieldSet(this, _EmitterInstance_startParticlesAdded, true, "f");
                this.emitParticles(this.emitterOptions.startCount);
            }
            if (this.duration !== undefined) {
                this.currentDuration += delta.value;
                if (this.currentDuration >= this.duration) {
                    this.pause();
                    if (this.spawnDelay !== undefined) {
                        delete this.spawnDelay;
                    }
                    if (!this.immortal) {
                        this.lifeCount--;
                    }
                    if (this.lifeCount > 0 || this.immortal) {
                        this.position = this.calcPosition();
                        this.spawnDelay =
                            (((_c = this.emitterOptions.life.delay) !== null && _c !== void 0 ? _c : 0) * 1000) / this.container.retina.reduceFactor;
                    }
                    else {
                        this.destroy();
                    }
                    this.currentDuration -= this.duration;
                    delete this.duration;
                }
            }
            if (this.spawnDelay !== undefined) {
                this.currentSpawnDelay += delta.value;
                if (this.currentSpawnDelay >= this.spawnDelay) {
                    this.play();
                    this.currentSpawnDelay -= this.currentSpawnDelay;
                    delete this.spawnDelay;
                }
            }
            if (this.emitDelay !== undefined) {
                this.currentEmitDelay += delta.value;
                if (this.currentEmitDelay >= this.emitDelay) {
                    this.emit();
                    this.currentEmitDelay -= this.emitDelay;
                }
            }
        }
        prepareToDie() {
            var _a;
            if (this.paused) {
                return;
            }
            const duration = (_a = this.emitterOptions.life) === null || _a === void 0 ? void 0 : _a.duration;
            if (this.container.retina.reduceFactor &&
                (this.lifeCount > 0 || this.immortal) &&
                duration !== undefined &&
                duration > 0) {
                this.duration = duration * 1000;
            }
        }
        destroy() {
            this.emitters.removeEmitter(this);
        }
        calcPosition() {
            var _a, _b;
            const container = this.container;
            const percentPosition = this.emitterOptions.position;
            return {
                x: (((_a = percentPosition === null || percentPosition === void 0 ? void 0 : percentPosition.x) !== null && _a !== void 0 ? _a : Math.random() * 100) / 100) * container.canvas.size.width,
                y: (((_b = percentPosition === null || percentPosition === void 0 ? void 0 : percentPosition.y) !== null && _b !== void 0 ? _b : Math.random() * 100) / 100) * container.canvas.size.height,
            };
        }
        emit() {
            if (this.paused) {
                return;
            }
            const quantity = (0, Utils$2.getRangeValue)(this.emitterOptions.rate.quantity);
            this.emitParticles(quantity);
        }
        emitParticles(quantity) {
            var _a, _b, _c;
            const container = this.container;
            const position = this.position;
            const offset = {
                x: this.size.mode === Enums$3.SizeMode.percent
                    ? (container.canvas.size.width * this.size.width) / 100
                    : this.size.width,
                y: this.size.mode === Enums$3.SizeMode.percent
                    ? (container.canvas.size.height * this.size.height) / 100
                    : this.size.height,
            };
            for (let i = 0; i < quantity; i++) {
                const particlesOptions = (0, Utils$2.deepExtend)({}, this.particlesOptions);
                if (this.spawnColor) {
                    const colorAnimation = (_a = this.emitterOptions.spawnColor) === null || _a === void 0 ? void 0 : _a.animation;
                    if (colorAnimation) {
                        const hueAnimation = colorAnimation;
                        if (hueAnimation.enable) {
                            this.spawnColor.h = this.setColorAnimation(hueAnimation, this.spawnColor.h, 360);
                        }
                        else {
                            const hslAnimation = colorAnimation;
                            this.spawnColor.h = this.setColorAnimation(hslAnimation.h, this.spawnColor.h, 360);
                            this.spawnColor.s = this.setColorAnimation(hslAnimation.s, this.spawnColor.s, 100);
                            this.spawnColor.l = this.setColorAnimation(hslAnimation.l, this.spawnColor.l, 100);
                        }
                    }
                    if (!particlesOptions.color) {
                        particlesOptions.color = {
                            value: this.spawnColor,
                        };
                    }
                    else {
                        particlesOptions.color.value = this.spawnColor;
                    }
                }
                const pPosition = (_c = (_b = this.shape) === null || _b === void 0 ? void 0 : _b.randomPosition(position, offset, this.fill)) !== null && _c !== void 0 ? _c : position;
                container.particles.addParticle(pPosition, particlesOptions);
            }
        }
        setColorAnimation(animation, initValue, maxValue) {
            var _a;
            const container = this.container;
            if (!animation.enable) {
                return initValue;
            }
            const colorOffset = (0, Utils$2.randomInRange)(animation.offset);
            const delay = (0, Utils$2.getRangeValue)(this.emitterOptions.rate.delay);
            const emitFactor = (1000 * delay) / container.retina.reduceFactor;
            const colorSpeed = (_a = animation.speed) !== null && _a !== void 0 ? _a : 0;
            return (initValue + (colorSpeed * container.fpsLimit) / emitFactor + colorOffset * 3.6) % maxValue;
        }
    }
    exports.EmitterInstance = EmitterInstance;
    _EmitterInstance_firstSpawn = new WeakMap(), _EmitterInstance_startParticlesAdded = new WeakMap();
    });

    unwrapExports(EmitterInstance_1);
    EmitterInstance_1.EmitterInstance;

    var EmitterRate_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.EmitterRate = void 0;

    class EmitterRate {
        constructor() {
            this.quantity = 1;
            this.delay = 0.1;
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.quantity !== undefined) {
                this.quantity = (0, Utils$2.setRangeValue)(data.quantity);
            }
            if (data.delay !== undefined) {
                this.delay = (0, Utils$2.setRangeValue)(data.delay);
            }
        }
    }
    exports.EmitterRate = EmitterRate;
    });

    unwrapExports(EmitterRate_1);
    EmitterRate_1.EmitterRate;

    var EmitterLife_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.EmitterLife = void 0;
    class EmitterLife {
        constructor() {
            this.wait = false;
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.count !== undefined) {
                this.count = data.count;
            }
            if (data.delay !== undefined) {
                this.delay = data.delay;
            }
            if (data.duration !== undefined) {
                this.duration = data.duration;
            }
            if (data.wait !== undefined) {
                this.wait = data.wait;
            }
        }
    }
    exports.EmitterLife = EmitterLife;
    });

    unwrapExports(EmitterLife_1);
    EmitterLife_1.EmitterLife;

    var EmitterClickMode_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.EmitterClickMode = void 0;
    (function (EmitterClickMode) {
        EmitterClickMode["emitter"] = "emitter";
    })(exports.EmitterClickMode || (exports.EmitterClickMode = {}));
    });

    unwrapExports(EmitterClickMode_1);
    EmitterClickMode_1.EmitterClickMode;

    var EmitterShapeType_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.EmitterShapeType = void 0;
    (function (EmitterShapeType) {
        EmitterShapeType["circle"] = "circle";
        EmitterShapeType["square"] = "square";
    })(exports.EmitterShapeType || (exports.EmitterShapeType = {}));
    });

    unwrapExports(EmitterShapeType_1);
    EmitterShapeType_1.EmitterShapeType;

    var Enums$1 = createCommonjsModule(function (module, exports) {
    var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
    }) : (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
    }));
    var __exportStar = (commonjsGlobal && commonjsGlobal.__exportStar) || function(m, exports) {
        for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    __exportStar(EmitterClickMode_1, exports);
    __exportStar(EmitterShapeType_1, exports);
    });

    unwrapExports(Enums$1);

    var Emitter_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Emitter = void 0;






    class Emitter {
        constructor() {
            this.autoPlay = true;
            this.fill = true;
            this.life = new EmitterLife_1.EmitterLife();
            this.rate = new EmitterRate_1.EmitterRate();
            this.shape = Enums$1.EmitterShapeType.square;
            this.startCount = 0;
        }
        load(data) {
            if (data === undefined) {
                return;
            }
            if (data.autoPlay !== undefined) {
                this.autoPlay = data.autoPlay;
            }
            if (data.size !== undefined) {
                if (this.size === undefined) {
                    this.size = new EmitterSize_1.EmitterSize();
                }
                this.size.load(data.size);
            }
            if (data.direction !== undefined) {
                this.direction = data.direction;
            }
            if (data.fill !== undefined) {
                this.fill = data.fill;
            }
            this.life.load(data.life);
            this.name = data.name;
            if (data.particles !== undefined) {
                this.particles = (0, Utils$2.deepExtend)({}, data.particles);
            }
            this.rate.load(data.rate);
            if (data.shape !== undefined) {
                this.shape = data.shape;
            }
            if (data.position !== undefined) {
                this.position = {
                    x: data.position.x,
                    y: data.position.y,
                };
            }
            if (data.spawnColor !== undefined) {
                if (this.spawnColor === undefined) {
                    this.spawnColor = new AnimatableColor_1.AnimatableColor();
                }
                this.spawnColor.load(data.spawnColor);
            }
            if (data.startCount !== undefined) {
                this.startCount = data.startCount;
            }
        }
    }
    exports.Emitter = Emitter;
    });

    unwrapExports(Emitter_1);
    Emitter_1.Emitter;

    var Emitters_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Emitters = void 0;




    class Emitters {
        constructor(container) {
            this.container = container;
            this.array = [];
            this.emitters = [];
            this.interactivityEmitters = [];
            const overridableContainer = container;
            overridableContainer.getEmitter = (idxOrName) => idxOrName === undefined || typeof idxOrName === "number"
                ? this.array[idxOrName || 0]
                : this.array.find((t) => t.name === idxOrName);
            overridableContainer.addEmitter = (options, position) => this.addEmitter(options, position);
            overridableContainer.playEmitter = (idxOrName) => {
                const emitter = overridableContainer.getEmitter(idxOrName);
                if (emitter) {
                    emitter.externalPlay();
                }
            };
            overridableContainer.pauseEmitter = (idxOrName) => {
                const emitter = overridableContainer.getEmitter(idxOrName);
                if (emitter) {
                    emitter.externalPause();
                }
            };
        }
        init(options) {
            var _a, _b;
            if (!options) {
                return;
            }
            if (options.emitters) {
                if (options.emitters instanceof Array) {
                    this.emitters = options.emitters.map((s) => {
                        const tmp = new Emitter_1.Emitter();
                        tmp.load(s);
                        return tmp;
                    });
                }
                else {
                    if (this.emitters instanceof Array) {
                        this.emitters = new Emitter_1.Emitter();
                    }
                    this.emitters.load(options.emitters);
                }
            }
            const interactivityEmitters = (_b = (_a = options.interactivity) === null || _a === void 0 ? void 0 : _a.modes) === null || _b === void 0 ? void 0 : _b.emitters;
            if (interactivityEmitters) {
                if (interactivityEmitters instanceof Array) {
                    this.interactivityEmitters = interactivityEmitters.map((s) => {
                        const tmp = new Emitter_1.Emitter();
                        tmp.load(s);
                        return tmp;
                    });
                }
                else {
                    if (this.interactivityEmitters instanceof Array) {
                        this.interactivityEmitters = new Emitter_1.Emitter();
                    }
                    this.interactivityEmitters.load(interactivityEmitters);
                }
            }
            if (this.emitters instanceof Array) {
                for (const emitterOptions of this.emitters) {
                    this.addEmitter(emitterOptions);
                }
            }
            else {
                this.addEmitter(this.emitters);
            }
        }
        play() {
            for (const emitter of this.array) {
                emitter.play();
            }
        }
        pause() {
            for (const emitter of this.array) {
                emitter.pause();
            }
        }
        stop() {
            this.array = [];
        }
        update(delta) {
            for (const emitter of this.array) {
                emitter.update(delta);
            }
        }
        handleClickMode(mode) {
            const container = this.container;
            const emitterOptions = this.emitters;
            const modeEmitters = this.interactivityEmitters;
            if (mode === Enums$1.EmitterClickMode.emitter) {
                let emitterModeOptions;
                if (modeEmitters instanceof Array) {
                    if (modeEmitters.length > 0) {
                        emitterModeOptions = (0, Utils$2.itemFromArray)(modeEmitters);
                    }
                }
                else {
                    emitterModeOptions = modeEmitters;
                }
                const emittersOptions = emitterModeOptions !== null && emitterModeOptions !== void 0 ? emitterModeOptions : (emitterOptions instanceof Array ? (0, Utils$2.itemFromArray)(emitterOptions) : emitterOptions);
                const ePosition = container.interactivity.mouse.clickPosition;
                this.addEmitter((0, Utils$2.deepExtend)({}, emittersOptions), ePosition);
            }
        }
        resize() {
            for (const emitter of this.array) {
                emitter.resize();
            }
        }
        addEmitter(options, position) {
            const emitter = new EmitterInstance_1.EmitterInstance(this, this.container, options, position);
            this.array.push(emitter);
            return emitter;
        }
        removeEmitter(emitter) {
            const index = this.array.indexOf(emitter);
            if (index >= 0) {
                this.array.splice(index, 1);
            }
        }
    }
    exports.Emitters = Emitters;
    });

    unwrapExports(Emitters_1);
    Emitters_1.Emitters;

    var CircleShape_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.CircleShape = void 0;
    class CircleShape {
        randomPosition(position, offset, fill) {
            const generateTheta = (x, y) => {
                const u = Math.random() / 4.0;
                const theta = Math.atan((y / x) * Math.tan(2 * Math.PI * u));
                const v = Math.random();
                if (v < 0.25) {
                    return theta;
                }
                else if (v < 0.5) {
                    return Math.PI - theta;
                }
                else if (v < 0.75) {
                    return Math.PI + theta;
                }
                else {
                    return -theta;
                }
            };
            const radius = (x, y, theta) => (x * y) / Math.sqrt((y * Math.cos(theta)) ** 2 + (x * Math.sin(theta)) ** 2);
            const [a, b] = [offset.x / 2, offset.y / 2];
            const randomTheta = generateTheta(a, b), maxRadius = radius(a, b, randomTheta), randomRadius = fill ? maxRadius * Math.sqrt(Math.random()) : maxRadius;
            return {
                x: position.x + randomRadius * Math.cos(randomTheta),
                y: position.y + randomRadius * Math.sin(randomTheta),
            };
        }
    }
    exports.CircleShape = CircleShape;
    });

    unwrapExports(CircleShape_1);
    CircleShape_1.CircleShape;

    var SquareShape_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SquareShape = void 0;
    function randomSquareCoordinate(position, offset) {
        return position + offset * (Math.random() - 0.5);
    }
    class SquareShape {
        randomPosition(position, offset, fill) {
            if (fill) {
                return {
                    x: randomSquareCoordinate(position.x, offset.x),
                    y: randomSquareCoordinate(position.y, offset.y),
                };
            }
            else {
                const halfW = offset.x / 2, halfH = offset.y / 2, side = Math.floor(Math.random() * 4), v = (Math.random() - 0.5) * 2;
                switch (side) {
                    case 0:
                        return {
                            x: position.x + v * halfW,
                            y: position.y - halfH,
                        };
                    case 1:
                        return {
                            x: position.x - halfW,
                            y: position.y + v * halfH,
                        };
                    case 2:
                        return {
                            x: position.x + v * halfW,
                            y: position.y + halfH,
                        };
                    case 3:
                    default:
                        return {
                            x: position.x + halfW,
                            y: position.y + v * halfH,
                        };
                }
            }
        }
    }
    exports.SquareShape = SquareShape;
    });

    unwrapExports(SquareShape_1);
    SquareShape_1.SquareShape;

    var EmittersMain = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(EmittersMain);

    var plugin$1 = createCommonjsModule(function (module, exports) {
    var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
    }) : (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
    }));
    var __exportStar = (commonjsGlobal && commonjsGlobal.__exportStar) || function(m, exports) {
        for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadEmittersPlugin = void 0;







    class EmittersPlugin {
        constructor() {
            this.id = "emitters";
        }
        getPlugin(container) {
            return new Emitters_1.Emitters(container);
        }
        needsPlugin(options) {
            var _a, _b, _c;
            if (options === undefined) {
                return false;
            }
            const emitters = options.emitters;
            return ((emitters instanceof Array && !!emitters.length) ||
                emitters !== undefined ||
                (!!((_c = (_b = (_a = options.interactivity) === null || _a === void 0 ? void 0 : _a.events) === null || _b === void 0 ? void 0 : _b.onClick) === null || _c === void 0 ? void 0 : _c.mode) &&
                    (0, Utils$2.isInArray)(Enums$1.EmitterClickMode.emitter, options.interactivity.events.onClick.mode)));
        }
        loadOptions(options, source) {
            var _a, _b;
            if (!this.needsPlugin(options) && !this.needsPlugin(source)) {
                return;
            }
            const optionsCast = options;
            if (source === null || source === void 0 ? void 0 : source.emitters) {
                if ((source === null || source === void 0 ? void 0 : source.emitters) instanceof Array) {
                    optionsCast.emitters = source === null || source === void 0 ? void 0 : source.emitters.map((s) => {
                        const tmp = new Emitter_1.Emitter();
                        tmp.load(s);
                        return tmp;
                    });
                }
                else {
                    let emitterOptions = optionsCast.emitters;
                    if ((emitterOptions === null || emitterOptions === void 0 ? void 0 : emitterOptions.load) === undefined) {
                        optionsCast.emitters = emitterOptions = new Emitter_1.Emitter();
                    }
                    emitterOptions.load(source === null || source === void 0 ? void 0 : source.emitters);
                }
            }
            const interactivityEmitters = (_b = (_a = source === null || source === void 0 ? void 0 : source.interactivity) === null || _a === void 0 ? void 0 : _a.modes) === null || _b === void 0 ? void 0 : _b.emitters;
            if (interactivityEmitters) {
                if (interactivityEmitters instanceof Array) {
                    optionsCast.interactivity.modes.emitters = interactivityEmitters.map((s) => {
                        const tmp = new Emitter_1.Emitter();
                        tmp.load(s);
                        return tmp;
                    });
                }
                else {
                    let emitterOptions = optionsCast.interactivity.modes.emitters;
                    if ((emitterOptions === null || emitterOptions === void 0 ? void 0 : emitterOptions.load) === undefined) {
                        optionsCast.interactivity.modes.emitters = emitterOptions = new Emitter_1.Emitter();
                    }
                    emitterOptions.load(interactivityEmitters);
                }
            }
        }
    }
    async function loadEmittersPlugin(tsParticles) {
        const plugin = new EmittersPlugin();
        await tsParticles.addPlugin(plugin);
        if (!tsParticles.addEmitterShape) {
            tsParticles.addEmitterShape = (name, shape) => {
                ShapeManager_1.ShapeManager.addShape(name, shape);
            };
        }
        tsParticles.addEmitterShape(Enums$1.EmitterShapeType.circle, new CircleShape_1.CircleShape());
        tsParticles.addEmitterShape(Enums$1.EmitterShapeType.square, new SquareShape_1.SquareShape());
    }
    exports.loadEmittersPlugin = loadEmittersPlugin;
    __exportStar(EmittersMain, exports);
    });

    unwrapExports(plugin$1);
    plugin$1.loadEmittersPlugin;

    var InlineArrangement_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.InlineArrangement = void 0;
    (function (InlineArrangement) {
        InlineArrangement["equidistant"] = "equidistant";
        InlineArrangement["onePerPoint"] = "one-per-point";
        InlineArrangement["perPoint"] = "per-point";
        InlineArrangement["randomLength"] = "random-length";
        InlineArrangement["randomPoint"] = "random-point";
    })(exports.InlineArrangement || (exports.InlineArrangement = {}));
    });

    unwrapExports(InlineArrangement_1);
    InlineArrangement_1.InlineArrangement;

    var MoveType_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MoveType = void 0;
    (function (MoveType) {
        MoveType["path"] = "path";
        MoveType["radius"] = "radius";
    })(exports.MoveType || (exports.MoveType = {}));
    });

    unwrapExports(MoveType_1);
    MoveType_1.MoveType;

    var Type_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Type = void 0;
    (function (Type) {
        Type["inline"] = "inline";
        Type["inside"] = "inside";
        Type["outside"] = "outside";
        Type["none"] = "none";
    })(exports.Type || (exports.Type = {}));
    });

    unwrapExports(Type_1);
    Type_1.Type;

    var Enums = createCommonjsModule(function (module, exports) {
    var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
    }) : (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
    }));
    var __exportStar = (commonjsGlobal && commonjsGlobal.__exportStar) || function(m, exports) {
        for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    __exportStar(InlineArrangement_1, exports);
    __exportStar(MoveType_1, exports);
    __exportStar(Type_1, exports);
    });

    unwrapExports(Enums);

    var DrawStroke_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DrawStroke = void 0;


    class DrawStroke {
        constructor() {
            this.color = new OptionsColor_1.OptionsColor();
            this.width = 0.5;
            this.opacity = 1;
        }
        load(data) {
            var _a;
            if (data !== undefined) {
                this.color = OptionsColor_1.OptionsColor.create(this.color, data.color);
                if (typeof this.color.value === "string") {
                    this.opacity = (_a = (0, Utils$2.stringToAlpha)(this.color.value)) !== null && _a !== void 0 ? _a : this.opacity;
                }
                if (data.opacity !== undefined) {
                    this.opacity = data.opacity;
                }
                if (data.width !== undefined) {
                    this.width = data.width;
                }
            }
        }
    }
    exports.DrawStroke = DrawStroke;
    });

    unwrapExports(DrawStroke_1);
    DrawStroke_1.DrawStroke;

    var Draw_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Draw = void 0;


    class Draw {
        constructor() {
            this.enable = false;
            this.stroke = new DrawStroke_1.DrawStroke();
        }
        get lineWidth() {
            return this.stroke.width;
        }
        set lineWidth(value) {
            this.stroke.width = value;
        }
        get lineColor() {
            return this.stroke.color;
        }
        set lineColor(value) {
            this.stroke.color = OptionsColor_1.OptionsColor.create(this.stroke.color, value);
        }
        load(data) {
            var _a;
            if (data !== undefined) {
                if (data.enable !== undefined) {
                    this.enable = data.enable;
                }
                const stroke = (_a = data.stroke) !== null && _a !== void 0 ? _a : {
                    color: data.lineColor,
                    width: data.lineWidth,
                };
                this.stroke.load(stroke);
            }
        }
    }
    exports.Draw = Draw;
    });

    unwrapExports(Draw_1);
    Draw_1.Draw;

    var Move_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Move = void 0;

    class Move {
        constructor() {
            this.radius = 10;
            this.type = Enums.MoveType.path;
        }
        load(data) {
            if (data !== undefined) {
                if (data.radius !== undefined) {
                    this.radius = data.radius;
                }
                if (data.type !== undefined) {
                    this.type = data.type;
                }
            }
        }
    }
    exports.Move = Move;
    });

    unwrapExports(Move_1);
    Move_1.Move;

    var Inline_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Inline = void 0;

    class Inline {
        constructor() {
            this.arrangement = Enums.InlineArrangement.onePerPoint;
        }
        load(data) {
            if (data !== undefined) {
                if (data.arrangement !== undefined) {
                    this.arrangement = data.arrangement;
                }
            }
        }
    }
    exports.Inline = Inline;
    });

    unwrapExports(Inline_1);
    Inline_1.Inline;

    var LocalSvg_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.LocalSvg = void 0;
    class LocalSvg {
        constructor() {
            this.path = [];
            this.size = {
                height: 0,
                width: 0,
            };
        }
        load(data) {
            if (data !== undefined) {
                if (data.path !== undefined) {
                    this.path = data.path;
                }
                if (data.size !== undefined) {
                    if (data.size.width !== undefined) {
                        this.size.width = data.size.width;
                    }
                    if (data.size.height !== undefined) {
                        this.size.height = data.size.height;
                    }
                }
            }
        }
    }
    exports.LocalSvg = LocalSvg;
    });

    unwrapExports(LocalSvg_1);
    LocalSvg_1.LocalSvg;

    var PolygonMask_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.PolygonMask = void 0;






    class PolygonMask {
        constructor() {
            this.draw = new Draw_1.Draw();
            this.enable = false;
            this.inline = new Inline_1.Inline();
            this.move = new Move_1.Move();
            this.scale = 1;
            this.type = Enums.Type.none;
        }
        get inlineArrangement() {
            return this.inline.arrangement;
        }
        set inlineArrangement(value) {
            this.inline.arrangement = value;
        }
        load(data) {
            var _a;
            if (data !== undefined) {
                this.draw.load(data.draw);
                const inline = (_a = data.inline) !== null && _a !== void 0 ? _a : {
                    arrangement: data.inlineArrangement,
                };
                if (inline !== undefined) {
                    this.inline.load(inline);
                }
                this.move.load(data.move);
                if (data.scale !== undefined) {
                    this.scale = data.scale;
                }
                if (data.type !== undefined) {
                    this.type = data.type;
                }
                if (data.enable !== undefined) {
                    this.enable = data.enable;
                }
                else {
                    this.enable = this.type !== Enums.Type.none;
                }
                if (data.url !== undefined) {
                    this.url = data.url;
                }
                if (data.data !== undefined) {
                    if (typeof data.data === "string") {
                        this.data = data.data;
                    }
                    else {
                        this.data = new LocalSvg_1.LocalSvg();
                        this.data.load(data.data);
                    }
                }
                if (data.position !== undefined) {
                    this.position = (0, Utils$2.deepExtend)({}, data.position);
                }
            }
        }
    }
    exports.PolygonMask = PolygonMask;
    });

    unwrapExports(PolygonMask_1);
    PolygonMask_1.PolygonMask;

    var utils = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.segmentBounce = exports.calcClosestPtOnSegment = exports.parsePaths = exports.drawPolygonMaskPath = exports.drawPolygonMask = void 0;

    function drawPolygonMask(context, rawData, stroke) {
        const color = (0, Utils$2.colorToRgb)(stroke.color);
        if (!color) {
            return;
        }
        context.beginPath();
        context.moveTo(rawData[0].x, rawData[0].y);
        for (const item of rawData) {
            context.lineTo(item.x, item.y);
        }
        context.closePath();
        context.strokeStyle = (0, Utils$2.getStyleFromRgb)(color);
        context.lineWidth = stroke.width;
        context.stroke();
    }
    exports.drawPolygonMask = drawPolygonMask;
    function drawPolygonMaskPath(context, path, stroke, position) {
        context.translate(position.x, position.y);
        const color = (0, Utils$2.colorToRgb)(stroke.color);
        if (!color) {
            return;
        }
        context.strokeStyle = (0, Utils$2.getStyleFromRgb)(color, stroke.opacity);
        context.lineWidth = stroke.width;
        context.stroke(path);
    }
    exports.drawPolygonMaskPath = drawPolygonMaskPath;
    function parsePaths(paths, scale, offset) {
        var _a;
        const res = [];
        for (const path of paths) {
            const segments = path.element.pathSegList;
            const len = (_a = segments === null || segments === void 0 ? void 0 : segments.numberOfItems) !== null && _a !== void 0 ? _a : 0;
            const p = {
                x: 0,
                y: 0,
            };
            for (let i = 0; i < len; i++) {
                const segment = segments === null || segments === void 0 ? void 0 : segments.getItem(i);
                const svgPathSeg = window.SVGPathSeg;
                switch (segment === null || segment === void 0 ? void 0 : segment.pathSegType) {
                    case svgPathSeg.PATHSEG_MOVETO_ABS:
                    case svgPathSeg.PATHSEG_LINETO_ABS:
                    case svgPathSeg.PATHSEG_CURVETO_CUBIC_ABS:
                    case svgPathSeg.PATHSEG_CURVETO_QUADRATIC_ABS:
                    case svgPathSeg.PATHSEG_ARC_ABS:
                    case svgPathSeg.PATHSEG_CURVETO_CUBIC_SMOOTH_ABS:
                    case svgPathSeg.PATHSEG_CURVETO_QUADRATIC_SMOOTH_ABS: {
                        const absSeg = segment;
                        p.x = absSeg.x;
                        p.y = absSeg.y;
                        break;
                    }
                    case svgPathSeg.PATHSEG_LINETO_HORIZONTAL_ABS:
                        p.x = segment.x;
                        break;
                    case svgPathSeg.PATHSEG_LINETO_VERTICAL_ABS:
                        p.y = segment.y;
                        break;
                    case svgPathSeg.PATHSEG_LINETO_REL:
                    case svgPathSeg.PATHSEG_MOVETO_REL:
                    case svgPathSeg.PATHSEG_CURVETO_CUBIC_REL:
                    case svgPathSeg.PATHSEG_CURVETO_QUADRATIC_REL:
                    case svgPathSeg.PATHSEG_ARC_REL:
                    case svgPathSeg.PATHSEG_CURVETO_CUBIC_SMOOTH_REL:
                    case svgPathSeg.PATHSEG_CURVETO_QUADRATIC_SMOOTH_REL: {
                        const relSeg = segment;
                        p.x += relSeg.x;
                        p.y += relSeg.y;
                        break;
                    }
                    case svgPathSeg.PATHSEG_LINETO_HORIZONTAL_REL:
                        p.x += segment.x;
                        break;
                    case svgPathSeg.PATHSEG_LINETO_VERTICAL_REL:
                        p.y += segment.y;
                        break;
                    case svgPathSeg.PATHSEG_UNKNOWN:
                    case svgPathSeg.PATHSEG_CLOSEPATH:
                        continue;
                }
                res.push({
                    x: p.x * scale + offset.x,
                    y: p.y * scale + offset.y,
                });
            }
        }
        return res;
    }
    exports.parsePaths = parsePaths;
    function calcClosestPtOnSegment(s1, s2, pos) {
        const { dx, dy } = (0, Utils$2.getDistances)(pos, s1);
        const { dx: dxx, dy: dyy } = (0, Utils$2.getDistances)(s2, s1);
        const t = (dx * dxx + dy * dyy) / (dxx ** 2 + dyy ** 2);
        let x = s1.x + dxx * t;
        let y = s1.y + dyy * t;
        if (t < 0) {
            x = s1.x;
            y = s1.y;
        }
        else if (t > 1) {
            x = s2.x;
            y = s2.y;
        }
        return { x: x, y: y, isOnSegment: t >= 0 && t <= 1 };
    }
    exports.calcClosestPtOnSegment = calcClosestPtOnSegment;
    function segmentBounce(start, stop, velocity) {
        const { dx, dy } = (0, Utils$2.getDistances)(start, stop);
        const wallAngle = Math.atan2(dy, dx);
        const wallNormalX = Math.sin(wallAngle);
        const wallNormalY = -Math.cos(wallAngle);
        const d = 2 * (velocity.x * wallNormalX + velocity.y * wallNormalY);
        velocity.x -= d * wallNormalX;
        velocity.y -= d * wallNormalY;
    }
    exports.segmentBounce = segmentBounce;
    });

    unwrapExports(utils);
    utils.segmentBounce;
    utils.calcClosestPtOnSegment;
    utils.parsePaths;
    utils.drawPolygonMaskPath;
    utils.drawPolygonMask;

    var PolygonMaskInstance_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.PolygonMaskInstance = void 0;





    class PolygonMaskInstance {
        constructor(container) {
            this.container = container;
            this.dimension = {
                height: 0,
                width: 0,
            };
            this.path2DSupported = !!window.Path2D;
            this.options = new PolygonMask_1.PolygonMask();
            this.polygonMaskMoveRadius = this.options.move.radius * container.retina.pixelRatio;
        }
        async initAsync(options) {
            this.options.load(options === null || options === void 0 ? void 0 : options.polygon);
            const polygonMaskOptions = this.options;
            this.polygonMaskMoveRadius = polygonMaskOptions.move.radius * this.container.retina.pixelRatio;
            if (polygonMaskOptions.enable) {
                await this.initRawData();
            }
        }
        resize() {
            const container = this.container;
            const options = this.options;
            if (!(options.enable && options.type !== Enums.Type.none)) {
                return;
            }
            if (this.redrawTimeout) {
                clearTimeout(this.redrawTimeout);
            }
            this.redrawTimeout = window.setTimeout(async () => {
                await this.initRawData(true);
                container.particles.redraw();
            }, 250);
        }
        stop() {
            delete this.raw;
            delete this.paths;
        }
        particlesInitialization() {
            const options = this.options;
            if (options.enable &&
                options.type === Enums.Type.inline &&
                (options.inline.arrangement === Enums.InlineArrangement.onePerPoint ||
                    options.inline.arrangement === Enums.InlineArrangement.perPoint)) {
                this.drawPoints();
                return true;
            }
            return false;
        }
        particlePosition(position) {
            var _a, _b;
            const options = this.options;
            if (!(options.enable && ((_b = (_a = this.raw) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0) > 0)) {
                return;
            }
            return (0, Utils$2.deepExtend)({}, position ? position : this.randomPoint());
        }
        particleBounce(particle, delta, direction) {
            return this.polygonBounce(particle, delta, direction);
        }
        clickPositionValid(position) {
            const options = this.options;
            return (options.enable &&
                options.type !== Enums.Type.none &&
                options.type !== Enums.Type.inline &&
                this.checkInsidePolygon(position));
        }
        draw(context) {
            var _a;
            if (!((_a = this.paths) === null || _a === void 0 ? void 0 : _a.length)) {
                return;
            }
            const options = this.options;
            const polygonDraw = options.draw;
            if (!(options.enable && polygonDraw.enable)) {
                return;
            }
            const rawData = this.raw;
            for (const path of this.paths) {
                const path2d = path.path2d;
                const path2dSupported = this.path2DSupported;
                if (!context) {
                    continue;
                }
                if (path2dSupported && path2d && this.offset) {
                    (0, utils.drawPolygonMaskPath)(context, path2d, polygonDraw.stroke, this.offset);
                }
                else if (rawData) {
                    (0, utils.drawPolygonMask)(context, rawData, polygonDraw.stroke);
                }
            }
        }
        polygonBounce(particle, _delta, direction) {
            const options = this.options;
            if (!this.raw || !options.enable || direction !== Enums$3.OutModeDirection.top) {
                return false;
            }
            if (options.type === Enums.Type.inside || options.type === Enums.Type.outside) {
                let closest, dx, dy;
                const pos = particle.getPosition(), radius = particle.getRadius();
                for (let i = 0, j = this.raw.length - 1; i < this.raw.length; j = i++) {
                    const pi = this.raw[i], pj = this.raw[j];
                    closest = (0, utils.calcClosestPtOnSegment)(pi, pj, pos);
                    const dist = (0, Utils$2.getDistances)(pos, closest);
                    [dx, dy] = [dist.dx, dist.dy];
                    if (dist.distance < radius) {
                        (0, utils.segmentBounce)(pi, pj, particle.velocity);
                        return true;
                    }
                }
                if (closest && dx !== undefined && dy !== undefined && !this.checkInsidePolygon(pos)) {
                    const factor = { x: 1, y: 1 };
                    if (particle.position.x >= closest.x) {
                        factor.x = -1;
                    }
                    if (particle.position.y >= closest.y) {
                        factor.y = -1;
                    }
                    particle.position.x = closest.x + radius * 2 * factor.x;
                    particle.position.y = closest.y + radius * 2 * factor.y;
                    particle.velocity.mult(-1);
                    return true;
                }
            }
            else if (options.type === Enums.Type.inline && particle.initialPosition) {
                const dist = (0, Utils$2.getDistance)(particle.initialPosition, particle.getPosition());
                if (dist > this.polygonMaskMoveRadius) {
                    particle.velocity.x = particle.velocity.y / 2 - particle.velocity.x;
                    particle.velocity.y = particle.velocity.x / 2 - particle.velocity.y;
                    return true;
                }
            }
            return false;
        }
        checkInsidePolygon(position) {
            var _a, _b;
            const container = this.container;
            const options = this.options;
            if (!options.enable || options.type === Enums.Type.none || options.type === Enums.Type.inline) {
                return true;
            }
            if (!this.raw) {
                throw new Error(Utils$2.Constants.noPolygonFound);
            }
            const canvasSize = container.canvas.size;
            const x = (_a = position === null || position === void 0 ? void 0 : position.x) !== null && _a !== void 0 ? _a : Math.random() * canvasSize.width;
            const y = (_b = position === null || position === void 0 ? void 0 : position.y) !== null && _b !== void 0 ? _b : Math.random() * canvasSize.height;
            let inside = false;
            for (let i = 0, j = this.raw.length - 1; i < this.raw.length; j = i++) {
                const pi = this.raw[i];
                const pj = this.raw[j];
                const intersect = pi.y > y !== pj.y > y && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x;
                if (intersect) {
                    inside = !inside;
                }
            }
            return options.type === Enums.Type.inside ? inside : options.type === Enums.Type.outside ? !inside : false;
        }
        parseSvgPath(xml, force) {
            var _a, _b, _c;
            const forceDownload = force !== null && force !== void 0 ? force : false;
            if (this.paths !== undefined && !forceDownload) {
                return this.raw;
            }
            const container = this.container;
            const options = this.options;
            const parser = new DOMParser();
            const doc = parser.parseFromString(xml, "image/svg+xml");
            const svg = doc.getElementsByTagName("svg")[0];
            let svgPaths = svg.getElementsByTagName("path");
            if (!svgPaths.length) {
                svgPaths = doc.getElementsByTagName("path");
            }
            this.paths = [];
            for (let i = 0; i < svgPaths.length; i++) {
                const path = svgPaths.item(i);
                if (path) {
                    this.paths.push({
                        element: path,
                        length: path.getTotalLength(),
                    });
                }
            }
            const pxRatio = container.retina.pixelRatio;
            const scale = options.scale / pxRatio;
            this.dimension.width = parseFloat((_a = svg.getAttribute("width")) !== null && _a !== void 0 ? _a : "0") * scale;
            this.dimension.height = parseFloat((_b = svg.getAttribute("height")) !== null && _b !== void 0 ? _b : "0") * scale;
            const position = (_c = options.position) !== null && _c !== void 0 ? _c : {
                x: 50,
                y: 50,
            };
            this.offset = {
                x: (container.canvas.size.width * position.x) / (100 * pxRatio) - this.dimension.width / 2,
                y: (container.canvas.size.height * position.y) / (100 * pxRatio) - this.dimension.height / 2,
            };
            return (0, utils.parsePaths)(this.paths, scale, this.offset);
        }
        async downloadSvgPath(svgUrl, force) {
            const options = this.options;
            const url = svgUrl || options.url;
            const forceDownload = force !== null && force !== void 0 ? force : false;
            if (!url || (this.paths !== undefined && !forceDownload)) {
                return this.raw;
            }
            const req = await fetch(url);
            if (!req.ok) {
                throw new Error("tsParticles Error - Error occurred during polygon mask download");
            }
            return this.parseSvgPath(await req.text(), force);
        }
        drawPoints() {
            if (!this.raw) {
                return;
            }
            for (const item of this.raw) {
                this.container.particles.addParticle({
                    x: item.x,
                    y: item.y,
                });
            }
        }
        randomPoint() {
            const container = this.container;
            const options = this.options;
            let position;
            if (options.type === Enums.Type.inline) {
                switch (options.inline.arrangement) {
                    case Enums.InlineArrangement.randomPoint:
                        position = this.getRandomPoint();
                        break;
                    case Enums.InlineArrangement.randomLength:
                        position = this.getRandomPointByLength();
                        break;
                    case Enums.InlineArrangement.equidistant:
                        position = this.getEquidistantPointByIndex(container.particles.count);
                        break;
                    case Enums.InlineArrangement.onePerPoint:
                    case Enums.InlineArrangement.perPoint:
                    default:
                        position = this.getPointByIndex(container.particles.count);
                }
            }
            else {
                position = {
                    x: Math.random() * container.canvas.size.width,
                    y: Math.random() * container.canvas.size.height,
                };
            }
            if (this.checkInsidePolygon(position)) {
                return position;
            }
            else {
                return this.randomPoint();
            }
        }
        getRandomPoint() {
            if (!this.raw || !this.raw.length) {
                throw new Error(Utils$2.Constants.noPolygonDataLoaded);
            }
            const coords = (0, Utils$2.itemFromArray)(this.raw);
            return {
                x: coords.x,
                y: coords.y,
            };
        }
        getRandomPointByLength() {
            var _a, _b, _c;
            const options = this.options;
            if (!this.raw || !this.raw.length || !((_a = this.paths) === null || _a === void 0 ? void 0 : _a.length)) {
                throw new Error(Utils$2.Constants.noPolygonDataLoaded);
            }
            const path = (0, Utils$2.itemFromArray)(this.paths);
            const distance = Math.floor(Math.random() * path.length) + 1;
            const point = path.element.getPointAtLength(distance);
            return {
                x: point.x * options.scale + (((_b = this.offset) === null || _b === void 0 ? void 0 : _b.x) || 0),
                y: point.y * options.scale + (((_c = this.offset) === null || _c === void 0 ? void 0 : _c.y) || 0),
            };
        }
        getEquidistantPointByIndex(index) {
            var _a, _b, _c, _d, _e, _f, _g;
            const options = this.container.actualOptions;
            const polygonMaskOptions = this.options;
            if (!this.raw || !this.raw.length || !((_a = this.paths) === null || _a === void 0 ? void 0 : _a.length))
                throw new Error(Utils$2.Constants.noPolygonDataLoaded);
            let offset = 0;
            let point;
            const totalLength = this.paths.reduce((tot, path) => tot + path.length, 0);
            const distance = totalLength / options.particles.number.value;
            for (const path of this.paths) {
                const pathDistance = distance * index - offset;
                if (pathDistance <= path.length) {
                    point = path.element.getPointAtLength(pathDistance);
                    break;
                }
                else {
                    offset += path.length;
                }
            }
            return {
                x: ((_b = point === null || point === void 0 ? void 0 : point.x) !== null && _b !== void 0 ? _b : 0) * polygonMaskOptions.scale + ((_d = (_c = this.offset) === null || _c === void 0 ? void 0 : _c.x) !== null && _d !== void 0 ? _d : 0),
                y: ((_e = point === null || point === void 0 ? void 0 : point.y) !== null && _e !== void 0 ? _e : 0) * polygonMaskOptions.scale + ((_g = (_f = this.offset) === null || _f === void 0 ? void 0 : _f.y) !== null && _g !== void 0 ? _g : 0),
            };
        }
        getPointByIndex(index) {
            if (!this.raw || !this.raw.length) {
                throw new Error(Utils$2.Constants.noPolygonDataLoaded);
            }
            const coords = this.raw[index % this.raw.length];
            return {
                x: coords.x,
                y: coords.y,
            };
        }
        createPath2D() {
            var _a, _b;
            const options = this.options;
            if (!this.path2DSupported || !((_a = this.paths) === null || _a === void 0 ? void 0 : _a.length)) {
                return;
            }
            for (const path of this.paths) {
                const pathData = (_b = path.element) === null || _b === void 0 ? void 0 : _b.getAttribute("d");
                if (pathData) {
                    const path2d = new Path2D(pathData);
                    const matrix = document.createElementNS("http://www.w3.org/2000/svg", "svg").createSVGMatrix();
                    const finalPath = new Path2D();
                    const transform = matrix.scale(options.scale);
                    if (finalPath.addPath) {
                        finalPath.addPath(path2d, transform);
                        path.path2d = finalPath;
                    }
                    else {
                        delete path.path2d;
                    }
                }
                else {
                    delete path.path2d;
                }
                if (path.path2d || !this.raw) {
                    continue;
                }
                path.path2d = new Path2D();
                path.path2d.moveTo(this.raw[0].x, this.raw[0].y);
                this.raw.forEach((pos, i) => {
                    var _a;
                    if (i > 0) {
                        (_a = path.path2d) === null || _a === void 0 ? void 0 : _a.lineTo(pos.x, pos.y);
                    }
                });
                path.path2d.closePath();
            }
        }
        async initRawData(force) {
            const options = this.options;
            if (options.url) {
                this.raw = await this.downloadSvgPath(options.url, force);
            }
            else if (options.data) {
                const data = options.data;
                let svg;
                if (typeof data !== "string") {
                    const path = data.path instanceof Array
                        ? data.path.map((t) => `<path d="${t}" />`).join("")
                        : `<path d="${data.path}" />`;
                    const namespaces = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"';
                    svg = `<svg ${namespaces} width="${data.size.width}" height="${data.size.height}">${path}</svg>`;
                }
                else {
                    svg = data;
                }
                this.raw = this.parseSvgPath(svg, force);
            }
            this.createPath2D();
        }
    }
    exports.PolygonMaskInstance = PolygonMaskInstance;
    });

    unwrapExports(PolygonMaskInstance_1);
    PolygonMaskInstance_1.PolygonMaskInstance;

    (function () {
        try {
            if (typeof window === "undefined")
                return;
            if (!("SVGPathSeg" in window)) {
                window.SVGPathSeg = function (type, typeAsLetter, owningPathSegList) {
                    this.pathSegType = type;
                    this.pathSegTypeAsLetter = typeAsLetter;
                    this._owningPathSegList = owningPathSegList;
                };
                window.SVGPathSeg.prototype.classname = "SVGPathSeg";
                window.SVGPathSeg.PATHSEG_UNKNOWN = 0;
                window.SVGPathSeg.PATHSEG_CLOSEPATH = 1;
                window.SVGPathSeg.PATHSEG_MOVETO_ABS = 2;
                window.SVGPathSeg.PATHSEG_MOVETO_REL = 3;
                window.SVGPathSeg.PATHSEG_LINETO_ABS = 4;
                window.SVGPathSeg.PATHSEG_LINETO_REL = 5;
                window.SVGPathSeg.PATHSEG_CURVETO_CUBIC_ABS = 6;
                window.SVGPathSeg.PATHSEG_CURVETO_CUBIC_REL = 7;
                window.SVGPathSeg.PATHSEG_CURVETO_QUADRATIC_ABS = 8;
                window.SVGPathSeg.PATHSEG_CURVETO_QUADRATIC_REL = 9;
                window.SVGPathSeg.PATHSEG_ARC_ABS = 10;
                window.SVGPathSeg.PATHSEG_ARC_REL = 11;
                window.SVGPathSeg.PATHSEG_LINETO_HORIZONTAL_ABS = 12;
                window.SVGPathSeg.PATHSEG_LINETO_HORIZONTAL_REL = 13;
                window.SVGPathSeg.PATHSEG_LINETO_VERTICAL_ABS = 14;
                window.SVGPathSeg.PATHSEG_LINETO_VERTICAL_REL = 15;
                window.SVGPathSeg.PATHSEG_CURVETO_CUBIC_SMOOTH_ABS = 16;
                window.SVGPathSeg.PATHSEG_CURVETO_CUBIC_SMOOTH_REL = 17;
                window.SVGPathSeg.PATHSEG_CURVETO_QUADRATIC_SMOOTH_ABS = 18;
                window.SVGPathSeg.PATHSEG_CURVETO_QUADRATIC_SMOOTH_REL = 19;
                window.SVGPathSeg.prototype._segmentChanged = function () {
                    if (this._owningPathSegList)
                        this._owningPathSegList.segmentChanged(this);
                };
                window.SVGPathSegClosePath = function (owningPathSegList) {
                    window.SVGPathSeg.call(this, window.SVGPathSeg.PATHSEG_CLOSEPATH, "z", owningPathSegList);
                };
                window.SVGPathSegClosePath.prototype = Object.create(window.SVGPathSeg.prototype);
                window.SVGPathSegClosePath.prototype.toString = function () {
                    return "[object SVGPathSegClosePath]";
                };
                window.SVGPathSegClosePath.prototype._asPathString = function () {
                    return this.pathSegTypeAsLetter;
                };
                window.SVGPathSegClosePath.prototype.clone = function () {
                    return new window.SVGPathSegClosePath(undefined);
                };
                window.SVGPathSegMovetoAbs = function (owningPathSegList, x, y) {
                    window.SVGPathSeg.call(this, window.SVGPathSeg.PATHSEG_MOVETO_ABS, "M", owningPathSegList);
                    this._x = x;
                    this._y = y;
                };
                window.SVGPathSegMovetoAbs.prototype = Object.create(window.SVGPathSeg.prototype);
                window.SVGPathSegMovetoAbs.prototype.toString = function () {
                    return "[object SVGPathSegMovetoAbs]";
                };
                window.SVGPathSegMovetoAbs.prototype._asPathString = function () {
                    return this.pathSegTypeAsLetter + " " + this._x + " " + this._y;
                };
                window.SVGPathSegMovetoAbs.prototype.clone = function () {
                    return new window.SVGPathSegMovetoAbs(undefined, this._x, this._y);
                };
                Object.defineProperty(window.SVGPathSegMovetoAbs.prototype, "x", {
                    get: function () {
                        return this._x;
                    },
                    set: function (x) {
                        this._x = x;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegMovetoAbs.prototype, "y", {
                    get: function () {
                        return this._y;
                    },
                    set: function (y) {
                        this._y = y;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                window.SVGPathSegMovetoRel = function (owningPathSegList, x, y) {
                    window.SVGPathSeg.call(this, window.SVGPathSeg.PATHSEG_MOVETO_REL, "m", owningPathSegList);
                    this._x = x;
                    this._y = y;
                };
                window.SVGPathSegMovetoRel.prototype = Object.create(window.SVGPathSeg.prototype);
                window.SVGPathSegMovetoRel.prototype.toString = function () {
                    return "[object SVGPathSegMovetoRel]";
                };
                window.SVGPathSegMovetoRel.prototype._asPathString = function () {
                    return this.pathSegTypeAsLetter + " " + this._x + " " + this._y;
                };
                window.SVGPathSegMovetoRel.prototype.clone = function () {
                    return new window.SVGPathSegMovetoRel(undefined, this._x, this._y);
                };
                Object.defineProperty(window.SVGPathSegMovetoRel.prototype, "x", {
                    get: function () {
                        return this._x;
                    },
                    set: function (x) {
                        this._x = x;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegMovetoRel.prototype, "y", {
                    get: function () {
                        return this._y;
                    },
                    set: function (y) {
                        this._y = y;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                window.SVGPathSegLinetoAbs = function (owningPathSegList, x, y) {
                    window.SVGPathSeg.call(this, window.SVGPathSeg.PATHSEG_LINETO_ABS, "L", owningPathSegList);
                    this._x = x;
                    this._y = y;
                };
                window.SVGPathSegLinetoAbs.prototype = Object.create(window.SVGPathSeg.prototype);
                window.SVGPathSegLinetoAbs.prototype.toString = function () {
                    return "[object SVGPathSegLinetoAbs]";
                };
                window.SVGPathSegLinetoAbs.prototype._asPathString = function () {
                    return this.pathSegTypeAsLetter + " " + this._x + " " + this._y;
                };
                window.SVGPathSegLinetoAbs.prototype.clone = function () {
                    return new window.SVGPathSegLinetoAbs(undefined, this._x, this._y);
                };
                Object.defineProperty(window.SVGPathSegLinetoAbs.prototype, "x", {
                    get: function () {
                        return this._x;
                    },
                    set: function (x) {
                        this._x = x;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegLinetoAbs.prototype, "y", {
                    get: function () {
                        return this._y;
                    },
                    set: function (y) {
                        this._y = y;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                window.SVGPathSegLinetoRel = function (owningPathSegList, x, y) {
                    window.SVGPathSeg.call(this, window.SVGPathSeg.PATHSEG_LINETO_REL, "l", owningPathSegList);
                    this._x = x;
                    this._y = y;
                };
                window.SVGPathSegLinetoRel.prototype = Object.create(window.SVGPathSeg.prototype);
                window.SVGPathSegLinetoRel.prototype.toString = function () {
                    return "[object SVGPathSegLinetoRel]";
                };
                window.SVGPathSegLinetoRel.prototype._asPathString = function () {
                    return this.pathSegTypeAsLetter + " " + this._x + " " + this._y;
                };
                window.SVGPathSegLinetoRel.prototype.clone = function () {
                    return new window.SVGPathSegLinetoRel(undefined, this._x, this._y);
                };
                Object.defineProperty(window.SVGPathSegLinetoRel.prototype, "x", {
                    get: function () {
                        return this._x;
                    },
                    set: function (x) {
                        this._x = x;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegLinetoRel.prototype, "y", {
                    get: function () {
                        return this._y;
                    },
                    set: function (y) {
                        this._y = y;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                window.SVGPathSegCurvetoCubicAbs = function (owningPathSegList, x, y, x1, y1, x2, y2) {
                    window.SVGPathSeg.call(this, window.SVGPathSeg.PATHSEG_CURVETO_CUBIC_ABS, "C", owningPathSegList);
                    this._x = x;
                    this._y = y;
                    this._x1 = x1;
                    this._y1 = y1;
                    this._x2 = x2;
                    this._y2 = y2;
                };
                window.SVGPathSegCurvetoCubicAbs.prototype = Object.create(window.SVGPathSeg.prototype);
                window.SVGPathSegCurvetoCubicAbs.prototype.toString = function () {
                    return "[object SVGPathSegCurvetoCubicAbs]";
                };
                window.SVGPathSegCurvetoCubicAbs.prototype._asPathString = function () {
                    return (this.pathSegTypeAsLetter +
                        " " +
                        this._x1 +
                        " " +
                        this._y1 +
                        " " +
                        this._x2 +
                        " " +
                        this._y2 +
                        " " +
                        this._x +
                        " " +
                        this._y);
                };
                window.SVGPathSegCurvetoCubicAbs.prototype.clone = function () {
                    return new window.SVGPathSegCurvetoCubicAbs(undefined, this._x, this._y, this._x1, this._y1, this._x2, this._y2);
                };
                Object.defineProperty(window.SVGPathSegCurvetoCubicAbs.prototype, "x", {
                    get: function () {
                        return this._x;
                    },
                    set: function (x) {
                        this._x = x;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegCurvetoCubicAbs.prototype, "y", {
                    get: function () {
                        return this._y;
                    },
                    set: function (y) {
                        this._y = y;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegCurvetoCubicAbs.prototype, "x1", {
                    get: function () {
                        return this._x1;
                    },
                    set: function (x1) {
                        this._x1 = x1;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegCurvetoCubicAbs.prototype, "y1", {
                    get: function () {
                        return this._y1;
                    },
                    set: function (y1) {
                        this._y1 = y1;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegCurvetoCubicAbs.prototype, "x2", {
                    get: function () {
                        return this._x2;
                    },
                    set: function (x2) {
                        this._x2 = x2;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegCurvetoCubicAbs.prototype, "y2", {
                    get: function () {
                        return this._y2;
                    },
                    set: function (y2) {
                        this._y2 = y2;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                window.SVGPathSegCurvetoCubicRel = function (owningPathSegList, x, y, x1, y1, x2, y2) {
                    window.SVGPathSeg.call(this, window.SVGPathSeg.PATHSEG_CURVETO_CUBIC_REL, "c", owningPathSegList);
                    this._x = x;
                    this._y = y;
                    this._x1 = x1;
                    this._y1 = y1;
                    this._x2 = x2;
                    this._y2 = y2;
                };
                window.SVGPathSegCurvetoCubicRel.prototype = Object.create(window.SVGPathSeg.prototype);
                window.SVGPathSegCurvetoCubicRel.prototype.toString = function () {
                    return "[object SVGPathSegCurvetoCubicRel]";
                };
                window.SVGPathSegCurvetoCubicRel.prototype._asPathString = function () {
                    return (this.pathSegTypeAsLetter +
                        " " +
                        this._x1 +
                        " " +
                        this._y1 +
                        " " +
                        this._x2 +
                        " " +
                        this._y2 +
                        " " +
                        this._x +
                        " " +
                        this._y);
                };
                window.SVGPathSegCurvetoCubicRel.prototype.clone = function () {
                    return new window.SVGPathSegCurvetoCubicRel(undefined, this._x, this._y, this._x1, this._y1, this._x2, this._y2);
                };
                Object.defineProperty(window.SVGPathSegCurvetoCubicRel.prototype, "x", {
                    get: function () {
                        return this._x;
                    },
                    set: function (x) {
                        this._x = x;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegCurvetoCubicRel.prototype, "y", {
                    get: function () {
                        return this._y;
                    },
                    set: function (y) {
                        this._y = y;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegCurvetoCubicRel.prototype, "x1", {
                    get: function () {
                        return this._x1;
                    },
                    set: function (x1) {
                        this._x1 = x1;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegCurvetoCubicRel.prototype, "y1", {
                    get: function () {
                        return this._y1;
                    },
                    set: function (y1) {
                        this._y1 = y1;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegCurvetoCubicRel.prototype, "x2", {
                    get: function () {
                        return this._x2;
                    },
                    set: function (x2) {
                        this._x2 = x2;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegCurvetoCubicRel.prototype, "y2", {
                    get: function () {
                        return this._y2;
                    },
                    set: function (y2) {
                        this._y2 = y2;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                window.SVGPathSegCurvetoQuadraticAbs = function (owningPathSegList, x, y, x1, y1) {
                    window.SVGPathSeg.call(this, window.SVGPathSeg.PATHSEG_CURVETO_QUADRATIC_ABS, "Q", owningPathSegList);
                    this._x = x;
                    this._y = y;
                    this._x1 = x1;
                    this._y1 = y1;
                };
                window.SVGPathSegCurvetoQuadraticAbs.prototype = Object.create(window.SVGPathSeg.prototype);
                window.SVGPathSegCurvetoQuadraticAbs.prototype.toString = function () {
                    return "[object SVGPathSegCurvetoQuadraticAbs]";
                };
                window.SVGPathSegCurvetoQuadraticAbs.prototype._asPathString = function () {
                    return this.pathSegTypeAsLetter + " " + this._x1 + " " + this._y1 + " " + this._x + " " + this._y;
                };
                window.SVGPathSegCurvetoQuadraticAbs.prototype.clone = function () {
                    return new window.SVGPathSegCurvetoQuadraticAbs(undefined, this._x, this._y, this._x1, this._y1);
                };
                Object.defineProperty(window.SVGPathSegCurvetoQuadraticAbs.prototype, "x", {
                    get: function () {
                        return this._x;
                    },
                    set: function (x) {
                        this._x = x;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegCurvetoQuadraticAbs.prototype, "y", {
                    get: function () {
                        return this._y;
                    },
                    set: function (y) {
                        this._y = y;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegCurvetoQuadraticAbs.prototype, "x1", {
                    get: function () {
                        return this._x1;
                    },
                    set: function (x1) {
                        this._x1 = x1;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegCurvetoQuadraticAbs.prototype, "y1", {
                    get: function () {
                        return this._y1;
                    },
                    set: function (y1) {
                        this._y1 = y1;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                window.SVGPathSegCurvetoQuadraticRel = function (owningPathSegList, x, y, x1, y1) {
                    window.SVGPathSeg.call(this, window.SVGPathSeg.PATHSEG_CURVETO_QUADRATIC_REL, "q", owningPathSegList);
                    this._x = x;
                    this._y = y;
                    this._x1 = x1;
                    this._y1 = y1;
                };
                window.SVGPathSegCurvetoQuadraticRel.prototype = Object.create(window.SVGPathSeg.prototype);
                window.SVGPathSegCurvetoQuadraticRel.prototype.toString = function () {
                    return "[object SVGPathSegCurvetoQuadraticRel]";
                };
                window.SVGPathSegCurvetoQuadraticRel.prototype._asPathString = function () {
                    return this.pathSegTypeAsLetter + " " + this._x1 + " " + this._y1 + " " + this._x + " " + this._y;
                };
                window.SVGPathSegCurvetoQuadraticRel.prototype.clone = function () {
                    return new window.SVGPathSegCurvetoQuadraticRel(undefined, this._x, this._y, this._x1, this._y1);
                };
                Object.defineProperty(window.SVGPathSegCurvetoQuadraticRel.prototype, "x", {
                    get: function () {
                        return this._x;
                    },
                    set: function (x) {
                        this._x = x;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegCurvetoQuadraticRel.prototype, "y", {
                    get: function () {
                        return this._y;
                    },
                    set: function (y) {
                        this._y = y;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegCurvetoQuadraticRel.prototype, "x1", {
                    get: function () {
                        return this._x1;
                    },
                    set: function (x1) {
                        this._x1 = x1;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegCurvetoQuadraticRel.prototype, "y1", {
                    get: function () {
                        return this._y1;
                    },
                    set: function (y1) {
                        this._y1 = y1;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                window.SVGPathSegArcAbs = function (owningPathSegList, x, y, r1, r2, angle, largeArcFlag, sweepFlag) {
                    window.SVGPathSeg.call(this, window.SVGPathSeg.PATHSEG_ARC_ABS, "A", owningPathSegList);
                    this._x = x;
                    this._y = y;
                    this._r1 = r1;
                    this._r2 = r2;
                    this._angle = angle;
                    this._largeArcFlag = largeArcFlag;
                    this._sweepFlag = sweepFlag;
                };
                window.SVGPathSegArcAbs.prototype = Object.create(window.SVGPathSeg.prototype);
                window.SVGPathSegArcAbs.prototype.toString = function () {
                    return "[object SVGPathSegArcAbs]";
                };
                window.SVGPathSegArcAbs.prototype._asPathString = function () {
                    return (this.pathSegTypeAsLetter +
                        " " +
                        this._r1 +
                        " " +
                        this._r2 +
                        " " +
                        this._angle +
                        " " +
                        (this._largeArcFlag ? "1" : "0") +
                        " " +
                        (this._sweepFlag ? "1" : "0") +
                        " " +
                        this._x +
                        " " +
                        this._y);
                };
                window.SVGPathSegArcAbs.prototype.clone = function () {
                    return new window.SVGPathSegArcAbs(undefined, this._x, this._y, this._r1, this._r2, this._angle, this._largeArcFlag, this._sweepFlag);
                };
                Object.defineProperty(window.SVGPathSegArcAbs.prototype, "x", {
                    get: function () {
                        return this._x;
                    },
                    set: function (x) {
                        this._x = x;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegArcAbs.prototype, "y", {
                    get: function () {
                        return this._y;
                    },
                    set: function (y) {
                        this._y = y;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegArcAbs.prototype, "r1", {
                    get: function () {
                        return this._r1;
                    },
                    set: function (r1) {
                        this._r1 = r1;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegArcAbs.prototype, "r2", {
                    get: function () {
                        return this._r2;
                    },
                    set: function (r2) {
                        this._r2 = r2;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegArcAbs.prototype, "angle", {
                    get: function () {
                        return this._angle;
                    },
                    set: function (angle) {
                        this._angle = angle;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegArcAbs.prototype, "largeArcFlag", {
                    get: function () {
                        return this._largeArcFlag;
                    },
                    set: function (largeArcFlag) {
                        this._largeArcFlag = largeArcFlag;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegArcAbs.prototype, "sweepFlag", {
                    get: function () {
                        return this._sweepFlag;
                    },
                    set: function (sweepFlag) {
                        this._sweepFlag = sweepFlag;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                window.SVGPathSegArcRel = function (owningPathSegList, x, y, r1, r2, angle, largeArcFlag, sweepFlag) {
                    window.SVGPathSeg.call(this, window.SVGPathSeg.PATHSEG_ARC_REL, "a", owningPathSegList);
                    this._x = x;
                    this._y = y;
                    this._r1 = r1;
                    this._r2 = r2;
                    this._angle = angle;
                    this._largeArcFlag = largeArcFlag;
                    this._sweepFlag = sweepFlag;
                };
                window.SVGPathSegArcRel.prototype = Object.create(window.SVGPathSeg.prototype);
                window.SVGPathSegArcRel.prototype.toString = function () {
                    return "[object SVGPathSegArcRel]";
                };
                window.SVGPathSegArcRel.prototype._asPathString = function () {
                    return (this.pathSegTypeAsLetter +
                        " " +
                        this._r1 +
                        " " +
                        this._r2 +
                        " " +
                        this._angle +
                        " " +
                        (this._largeArcFlag ? "1" : "0") +
                        " " +
                        (this._sweepFlag ? "1" : "0") +
                        " " +
                        this._x +
                        " " +
                        this._y);
                };
                window.SVGPathSegArcRel.prototype.clone = function () {
                    return new window.SVGPathSegArcRel(undefined, this._x, this._y, this._r1, this._r2, this._angle, this._largeArcFlag, this._sweepFlag);
                };
                Object.defineProperty(window.SVGPathSegArcRel.prototype, "x", {
                    get: function () {
                        return this._x;
                    },
                    set: function (x) {
                        this._x = x;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegArcRel.prototype, "y", {
                    get: function () {
                        return this._y;
                    },
                    set: function (y) {
                        this._y = y;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegArcRel.prototype, "r1", {
                    get: function () {
                        return this._r1;
                    },
                    set: function (r1) {
                        this._r1 = r1;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegArcRel.prototype, "r2", {
                    get: function () {
                        return this._r2;
                    },
                    set: function (r2) {
                        this._r2 = r2;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegArcRel.prototype, "angle", {
                    get: function () {
                        return this._angle;
                    },
                    set: function (angle) {
                        this._angle = angle;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegArcRel.prototype, "largeArcFlag", {
                    get: function () {
                        return this._largeArcFlag;
                    },
                    set: function (largeArcFlag) {
                        this._largeArcFlag = largeArcFlag;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegArcRel.prototype, "sweepFlag", {
                    get: function () {
                        return this._sweepFlag;
                    },
                    set: function (sweepFlag) {
                        this._sweepFlag = sweepFlag;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                window.SVGPathSegLinetoHorizontalAbs = function (owningPathSegList, x) {
                    window.SVGPathSeg.call(this, window.SVGPathSeg.PATHSEG_LINETO_HORIZONTAL_ABS, "H", owningPathSegList);
                    this._x = x;
                };
                window.SVGPathSegLinetoHorizontalAbs.prototype = Object.create(window.SVGPathSeg.prototype);
                window.SVGPathSegLinetoHorizontalAbs.prototype.toString = function () {
                    return "[object SVGPathSegLinetoHorizontalAbs]";
                };
                window.SVGPathSegLinetoHorizontalAbs.prototype._asPathString = function () {
                    return this.pathSegTypeAsLetter + " " + this._x;
                };
                window.SVGPathSegLinetoHorizontalAbs.prototype.clone = function () {
                    return new window.SVGPathSegLinetoHorizontalAbs(undefined, this._x);
                };
                Object.defineProperty(window.SVGPathSegLinetoHorizontalAbs.prototype, "x", {
                    get: function () {
                        return this._x;
                    },
                    set: function (x) {
                        this._x = x;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                window.SVGPathSegLinetoHorizontalRel = function (owningPathSegList, x) {
                    window.SVGPathSeg.call(this, window.SVGPathSeg.PATHSEG_LINETO_HORIZONTAL_REL, "h", owningPathSegList);
                    this._x = x;
                };
                window.SVGPathSegLinetoHorizontalRel.prototype = Object.create(window.SVGPathSeg.prototype);
                window.SVGPathSegLinetoHorizontalRel.prototype.toString = function () {
                    return "[object SVGPathSegLinetoHorizontalRel]";
                };
                window.SVGPathSegLinetoHorizontalRel.prototype._asPathString = function () {
                    return this.pathSegTypeAsLetter + " " + this._x;
                };
                window.SVGPathSegLinetoHorizontalRel.prototype.clone = function () {
                    return new window.SVGPathSegLinetoHorizontalRel(undefined, this._x);
                };
                Object.defineProperty(window.SVGPathSegLinetoHorizontalRel.prototype, "x", {
                    get: function () {
                        return this._x;
                    },
                    set: function (x) {
                        this._x = x;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                window.SVGPathSegLinetoVerticalAbs = function (owningPathSegList, y) {
                    window.SVGPathSeg.call(this, window.SVGPathSeg.PATHSEG_LINETO_VERTICAL_ABS, "V", owningPathSegList);
                    this._y = y;
                };
                window.SVGPathSegLinetoVerticalAbs.prototype = Object.create(window.SVGPathSeg.prototype);
                window.SVGPathSegLinetoVerticalAbs.prototype.toString = function () {
                    return "[object SVGPathSegLinetoVerticalAbs]";
                };
                window.SVGPathSegLinetoVerticalAbs.prototype._asPathString = function () {
                    return this.pathSegTypeAsLetter + " " + this._y;
                };
                window.SVGPathSegLinetoVerticalAbs.prototype.clone = function () {
                    return new window.SVGPathSegLinetoVerticalAbs(undefined, this._y);
                };
                Object.defineProperty(window.SVGPathSegLinetoVerticalAbs.prototype, "y", {
                    get: function () {
                        return this._y;
                    },
                    set: function (y) {
                        this._y = y;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                window.SVGPathSegLinetoVerticalRel = function (owningPathSegList, y) {
                    window.SVGPathSeg.call(this, window.SVGPathSeg.PATHSEG_LINETO_VERTICAL_REL, "v", owningPathSegList);
                    this._y = y;
                };
                window.SVGPathSegLinetoVerticalRel.prototype = Object.create(window.SVGPathSeg.prototype);
                window.SVGPathSegLinetoVerticalRel.prototype.toString = function () {
                    return "[object SVGPathSegLinetoVerticalRel]";
                };
                window.SVGPathSegLinetoVerticalRel.prototype._asPathString = function () {
                    return this.pathSegTypeAsLetter + " " + this._y;
                };
                window.SVGPathSegLinetoVerticalRel.prototype.clone = function () {
                    return new window.SVGPathSegLinetoVerticalRel(undefined, this._y);
                };
                Object.defineProperty(window.SVGPathSegLinetoVerticalRel.prototype, "y", {
                    get: function () {
                        return this._y;
                    },
                    set: function (y) {
                        this._y = y;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                window.SVGPathSegCurvetoCubicSmoothAbs = function (owningPathSegList, x, y, x2, y2) {
                    window.SVGPathSeg.call(this, window.SVGPathSeg.PATHSEG_CURVETO_CUBIC_SMOOTH_ABS, "S", owningPathSegList);
                    this._x = x;
                    this._y = y;
                    this._x2 = x2;
                    this._y2 = y2;
                };
                window.SVGPathSegCurvetoCubicSmoothAbs.prototype = Object.create(window.SVGPathSeg.prototype);
                window.SVGPathSegCurvetoCubicSmoothAbs.prototype.toString = function () {
                    return "[object SVGPathSegCurvetoCubicSmoothAbs]";
                };
                window.SVGPathSegCurvetoCubicSmoothAbs.prototype._asPathString = function () {
                    return this.pathSegTypeAsLetter + " " + this._x2 + " " + this._y2 + " " + this._x + " " + this._y;
                };
                window.SVGPathSegCurvetoCubicSmoothAbs.prototype.clone = function () {
                    return new window.SVGPathSegCurvetoCubicSmoothAbs(undefined, this._x, this._y, this._x2, this._y2);
                };
                Object.defineProperty(window.SVGPathSegCurvetoCubicSmoothAbs.prototype, "x", {
                    get: function () {
                        return this._x;
                    },
                    set: function (x) {
                        this._x = x;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegCurvetoCubicSmoothAbs.prototype, "y", {
                    get: function () {
                        return this._y;
                    },
                    set: function (y) {
                        this._y = y;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegCurvetoCubicSmoothAbs.prototype, "x2", {
                    get: function () {
                        return this._x2;
                    },
                    set: function (x2) {
                        this._x2 = x2;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegCurvetoCubicSmoothAbs.prototype, "y2", {
                    get: function () {
                        return this._y2;
                    },
                    set: function (y2) {
                        this._y2 = y2;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                window.SVGPathSegCurvetoCubicSmoothRel = function (owningPathSegList, x, y, x2, y2) {
                    window.SVGPathSeg.call(this, window.SVGPathSeg.PATHSEG_CURVETO_CUBIC_SMOOTH_REL, "s", owningPathSegList);
                    this._x = x;
                    this._y = y;
                    this._x2 = x2;
                    this._y2 = y2;
                };
                window.SVGPathSegCurvetoCubicSmoothRel.prototype = Object.create(window.SVGPathSeg.prototype);
                window.SVGPathSegCurvetoCubicSmoothRel.prototype.toString = function () {
                    return "[object SVGPathSegCurvetoCubicSmoothRel]";
                };
                window.SVGPathSegCurvetoCubicSmoothRel.prototype._asPathString = function () {
                    return this.pathSegTypeAsLetter + " " + this._x2 + " " + this._y2 + " " + this._x + " " + this._y;
                };
                window.SVGPathSegCurvetoCubicSmoothRel.prototype.clone = function () {
                    return new window.SVGPathSegCurvetoCubicSmoothRel(undefined, this._x, this._y, this._x2, this._y2);
                };
                Object.defineProperty(window.SVGPathSegCurvetoCubicSmoothRel.prototype, "x", {
                    get: function () {
                        return this._x;
                    },
                    set: function (x) {
                        this._x = x;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegCurvetoCubicSmoothRel.prototype, "y", {
                    get: function () {
                        return this._y;
                    },
                    set: function (y) {
                        this._y = y;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegCurvetoCubicSmoothRel.prototype, "x2", {
                    get: function () {
                        return this._x2;
                    },
                    set: function (x2) {
                        this._x2 = x2;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegCurvetoCubicSmoothRel.prototype, "y2", {
                    get: function () {
                        return this._y2;
                    },
                    set: function (y2) {
                        this._y2 = y2;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                window.SVGPathSegCurvetoQuadraticSmoothAbs = function (owningPathSegList, x, y) {
                    window.SVGPathSeg.call(this, window.SVGPathSeg.PATHSEG_CURVETO_QUADRATIC_SMOOTH_ABS, "T", owningPathSegList);
                    this._x = x;
                    this._y = y;
                };
                window.SVGPathSegCurvetoQuadraticSmoothAbs.prototype = Object.create(window.SVGPathSeg.prototype);
                window.SVGPathSegCurvetoQuadraticSmoothAbs.prototype.toString = function () {
                    return "[object SVGPathSegCurvetoQuadraticSmoothAbs]";
                };
                window.SVGPathSegCurvetoQuadraticSmoothAbs.prototype._asPathString = function () {
                    return this.pathSegTypeAsLetter + " " + this._x + " " + this._y;
                };
                window.SVGPathSegCurvetoQuadraticSmoothAbs.prototype.clone = function () {
                    return new window.SVGPathSegCurvetoQuadraticSmoothAbs(undefined, this._x, this._y);
                };
                Object.defineProperty(window.SVGPathSegCurvetoQuadraticSmoothAbs.prototype, "x", {
                    get: function () {
                        return this._x;
                    },
                    set: function (x) {
                        this._x = x;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegCurvetoQuadraticSmoothAbs.prototype, "y", {
                    get: function () {
                        return this._y;
                    },
                    set: function (y) {
                        this._y = y;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                window.SVGPathSegCurvetoQuadraticSmoothRel = function (owningPathSegList, x, y) {
                    window.SVGPathSeg.call(this, window.SVGPathSeg.PATHSEG_CURVETO_QUADRATIC_SMOOTH_REL, "t", owningPathSegList);
                    this._x = x;
                    this._y = y;
                };
                window.SVGPathSegCurvetoQuadraticSmoothRel.prototype = Object.create(window.SVGPathSeg.prototype);
                window.SVGPathSegCurvetoQuadraticSmoothRel.prototype.toString = function () {
                    return "[object SVGPathSegCurvetoQuadraticSmoothRel]";
                };
                window.SVGPathSegCurvetoQuadraticSmoothRel.prototype._asPathString = function () {
                    return this.pathSegTypeAsLetter + " " + this._x + " " + this._y;
                };
                window.SVGPathSegCurvetoQuadraticSmoothRel.prototype.clone = function () {
                    return new window.SVGPathSegCurvetoQuadraticSmoothRel(undefined, this._x, this._y);
                };
                Object.defineProperty(window.SVGPathSegCurvetoQuadraticSmoothRel.prototype, "x", {
                    get: function () {
                        return this._x;
                    },
                    set: function (x) {
                        this._x = x;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegCurvetoQuadraticSmoothRel.prototype, "y", {
                    get: function () {
                        return this._y;
                    },
                    set: function (y) {
                        this._y = y;
                        this._segmentChanged();
                    },
                    enumerable: true,
                });
                window.SVGPathElement.prototype.createSVGPathSegClosePath = function () {
                    return new window.SVGPathSegClosePath(undefined);
                };
                window.SVGPathElement.prototype.createSVGPathSegMovetoAbs = function (x, y) {
                    return new window.SVGPathSegMovetoAbs(undefined, x, y);
                };
                window.SVGPathElement.prototype.createSVGPathSegMovetoRel = function (x, y) {
                    return new window.SVGPathSegMovetoRel(undefined, x, y);
                };
                window.SVGPathElement.prototype.createSVGPathSegLinetoAbs = function (x, y) {
                    return new window.SVGPathSegLinetoAbs(undefined, x, y);
                };
                window.SVGPathElement.prototype.createSVGPathSegLinetoRel = function (x, y) {
                    return new window.SVGPathSegLinetoRel(undefined, x, y);
                };
                window.SVGPathElement.prototype.createSVGPathSegCurvetoCubicAbs = function (x, y, x1, y1, x2, y2) {
                    return new window.SVGPathSegCurvetoCubicAbs(undefined, x, y, x1, y1, x2, y2);
                };
                window.SVGPathElement.prototype.createSVGPathSegCurvetoCubicRel = function (x, y, x1, y1, x2, y2) {
                    return new window.SVGPathSegCurvetoCubicRel(undefined, x, y, x1, y1, x2, y2);
                };
                window.SVGPathElement.prototype.createSVGPathSegCurvetoQuadraticAbs = function (x, y, x1, y1) {
                    return new window.SVGPathSegCurvetoQuadraticAbs(undefined, x, y, x1, y1);
                };
                window.SVGPathElement.prototype.createSVGPathSegCurvetoQuadraticRel = function (x, y, x1, y1) {
                    return new window.SVGPathSegCurvetoQuadraticRel(undefined, x, y, x1, y1);
                };
                window.SVGPathElement.prototype.createSVGPathSegArcAbs = function (x, y, r1, r2, angle, largeArcFlag, sweepFlag) {
                    return new window.SVGPathSegArcAbs(undefined, x, y, r1, r2, angle, largeArcFlag, sweepFlag);
                };
                window.SVGPathElement.prototype.createSVGPathSegArcRel = function (x, y, r1, r2, angle, largeArcFlag, sweepFlag) {
                    return new window.SVGPathSegArcRel(undefined, x, y, r1, r2, angle, largeArcFlag, sweepFlag);
                };
                window.SVGPathElement.prototype.createSVGPathSegLinetoHorizontalAbs = function (x) {
                    return new window.SVGPathSegLinetoHorizontalAbs(undefined, x);
                };
                window.SVGPathElement.prototype.createSVGPathSegLinetoHorizontalRel = function (x) {
                    return new window.SVGPathSegLinetoHorizontalRel(undefined, x);
                };
                window.SVGPathElement.prototype.createSVGPathSegLinetoVerticalAbs = function (y) {
                    return new window.SVGPathSegLinetoVerticalAbs(undefined, y);
                };
                window.SVGPathElement.prototype.createSVGPathSegLinetoVerticalRel = function (y) {
                    return new window.SVGPathSegLinetoVerticalRel(undefined, y);
                };
                window.SVGPathElement.prototype.createSVGPathSegCurvetoCubicSmoothAbs = function (x, y, x2, y2) {
                    return new window.SVGPathSegCurvetoCubicSmoothAbs(undefined, x, y, x2, y2);
                };
                window.SVGPathElement.prototype.createSVGPathSegCurvetoCubicSmoothRel = function (x, y, x2, y2) {
                    return new window.SVGPathSegCurvetoCubicSmoothRel(undefined, x, y, x2, y2);
                };
                window.SVGPathElement.prototype.createSVGPathSegCurvetoQuadraticSmoothAbs = function (x, y) {
                    return new window.SVGPathSegCurvetoQuadraticSmoothAbs(undefined, x, y);
                };
                window.SVGPathElement.prototype.createSVGPathSegCurvetoQuadraticSmoothRel = function (x, y) {
                    return new window.SVGPathSegCurvetoQuadraticSmoothRel(undefined, x, y);
                };
                if (!("getPathSegAtLength" in window.SVGPathElement.prototype)) {
                    window.SVGPathElement.prototype.getPathSegAtLength = function (distance) {
                        if (distance === undefined || !isFinite(distance))
                            throw "Invalid arguments.";
                        var measurementElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
                        measurementElement.setAttribute("d", this.getAttribute("d"));
                        var lastPathSegment = measurementElement.pathSegList.numberOfItems - 1;
                        if (lastPathSegment <= 0)
                            return 0;
                        do {
                            measurementElement.pathSegList.removeItem(lastPathSegment);
                            if (distance > measurementElement.getTotalLength())
                                break;
                            lastPathSegment--;
                        } while (lastPathSegment > 0);
                        return lastPathSegment;
                    };
                }
            }
            if (!("SVGPathSegList" in window) || !("appendItem" in window.SVGPathSegList.prototype)) {
                window.SVGPathSegList = function (pathElement) {
                    this._pathElement = pathElement;
                    this._list = this._parsePath(this._pathElement.getAttribute("d"));
                    this._mutationObserverConfig = { attributes: true, attributeFilter: ["d"] };
                    this._pathElementMutationObserver = new MutationObserver(this._updateListFromPathMutations.bind(this));
                    this._pathElementMutationObserver.observe(this._pathElement, this._mutationObserverConfig);
                };
                window.SVGPathSegList.prototype.classname = "SVGPathSegList";
                Object.defineProperty(window.SVGPathSegList.prototype, "numberOfItems", {
                    get: function () {
                        this._checkPathSynchronizedToList();
                        return this._list.length;
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathSegList.prototype, "length", {
                    get: function () {
                        this._checkPathSynchronizedToList();
                        return this._list.length;
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathElement.prototype, "pathSegList", {
                    get: function () {
                        if (!this._pathSegList)
                            this._pathSegList = new window.SVGPathSegList(this);
                        return this._pathSegList;
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathElement.prototype, "normalizedPathSegList", {
                    get: function () {
                        return this.pathSegList;
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathElement.prototype, "animatedPathSegList", {
                    get: function () {
                        return this.pathSegList;
                    },
                    enumerable: true,
                });
                Object.defineProperty(window.SVGPathElement.prototype, "animatedNormalizedPathSegList", {
                    get: function () {
                        return this.pathSegList;
                    },
                    enumerable: true,
                });
                window.SVGPathSegList.prototype._checkPathSynchronizedToList = function () {
                    this._updateListFromPathMutations(this._pathElementMutationObserver.takeRecords());
                };
                window.SVGPathSegList.prototype._updateListFromPathMutations = function (mutationRecords) {
                    if (!this._pathElement)
                        return;
                    var hasPathMutations = false;
                    mutationRecords.forEach(function (record) {
                        if (record.attributeName == "d")
                            hasPathMutations = true;
                    });
                    if (hasPathMutations)
                        this._list = this._parsePath(this._pathElement.getAttribute("d"));
                };
                window.SVGPathSegList.prototype._writeListToPath = function () {
                    this._pathElementMutationObserver.disconnect();
                    this._pathElement.setAttribute("d", window.SVGPathSegList._pathSegArrayAsString(this._list));
                    this._pathElementMutationObserver.observe(this._pathElement, this._mutationObserverConfig);
                };
                window.SVGPathSegList.prototype.segmentChanged = function (pathSeg) {
                    this._writeListToPath();
                };
                window.SVGPathSegList.prototype.clear = function () {
                    this._checkPathSynchronizedToList();
                    this._list.forEach(function (pathSeg) {
                        pathSeg._owningPathSegList = null;
                    });
                    this._list = [];
                    this._writeListToPath();
                };
                window.SVGPathSegList.prototype.initialize = function (newItem) {
                    this._checkPathSynchronizedToList();
                    this._list = [newItem];
                    newItem._owningPathSegList = this;
                    this._writeListToPath();
                    return newItem;
                };
                window.SVGPathSegList.prototype._checkValidIndex = function (index) {
                    if (isNaN(index) || index < 0 || index >= this.numberOfItems)
                        throw "INDEX_SIZE_ERR";
                };
                window.SVGPathSegList.prototype.getItem = function (index) {
                    this._checkPathSynchronizedToList();
                    this._checkValidIndex(index);
                    return this._list[index];
                };
                window.SVGPathSegList.prototype.insertItemBefore = function (newItem, index) {
                    this._checkPathSynchronizedToList();
                    if (index > this.numberOfItems)
                        index = this.numberOfItems;
                    if (newItem._owningPathSegList) {
                        newItem = newItem.clone();
                    }
                    this._list.splice(index, 0, newItem);
                    newItem._owningPathSegList = this;
                    this._writeListToPath();
                    return newItem;
                };
                window.SVGPathSegList.prototype.replaceItem = function (newItem, index) {
                    this._checkPathSynchronizedToList();
                    if (newItem._owningPathSegList) {
                        newItem = newItem.clone();
                    }
                    this._checkValidIndex(index);
                    this._list[index] = newItem;
                    newItem._owningPathSegList = this;
                    this._writeListToPath();
                    return newItem;
                };
                window.SVGPathSegList.prototype.removeItem = function (index) {
                    this._checkPathSynchronizedToList();
                    this._checkValidIndex(index);
                    var item = this._list[index];
                    this._list.splice(index, 1);
                    this._writeListToPath();
                    return item;
                };
                window.SVGPathSegList.prototype.appendItem = function (newItem) {
                    this._checkPathSynchronizedToList();
                    if (newItem._owningPathSegList) {
                        newItem = newItem.clone();
                    }
                    this._list.push(newItem);
                    newItem._owningPathSegList = this;
                    this._writeListToPath();
                    return newItem;
                };
                window.SVGPathSegList._pathSegArrayAsString = function (pathSegArray) {
                    var string = "";
                    var first = true;
                    pathSegArray.forEach(function (pathSeg) {
                        if (first) {
                            first = false;
                            string += pathSeg._asPathString();
                        }
                        else {
                            string += " " + pathSeg._asPathString();
                        }
                    });
                    return string;
                };
                window.SVGPathSegList.prototype._parsePath = function (string) {
                    if (!string || string.length == 0)
                        return [];
                    var owningPathSegList = this;
                    var Builder = function () {
                        this.pathSegList = [];
                    };
                    Builder.prototype.appendSegment = function (pathSeg) {
                        this.pathSegList.push(pathSeg);
                    };
                    var Source = function (string) {
                        this._string = string;
                        this._currentIndex = 0;
                        this._endIndex = this._string.length;
                        this._previousCommand = window.SVGPathSeg.PATHSEG_UNKNOWN;
                        this._skipOptionalSpaces();
                    };
                    Source.prototype._isCurrentSpace = function () {
                        var character = this._string[this._currentIndex];
                        return (character <= " " &&
                            (character == " " || character == "\n" || character == "\t" || character == "\r" || character == "\f"));
                    };
                    Source.prototype._skipOptionalSpaces = function () {
                        while (this._currentIndex < this._endIndex && this._isCurrentSpace())
                            this._currentIndex++;
                        return this._currentIndex < this._endIndex;
                    };
                    Source.prototype._skipOptionalSpacesOrDelimiter = function () {
                        if (this._currentIndex < this._endIndex &&
                            !this._isCurrentSpace() &&
                            this._string.charAt(this._currentIndex) != ",")
                            return false;
                        if (this._skipOptionalSpaces()) {
                            if (this._currentIndex < this._endIndex && this._string.charAt(this._currentIndex) == ",") {
                                this._currentIndex++;
                                this._skipOptionalSpaces();
                            }
                        }
                        return this._currentIndex < this._endIndex;
                    };
                    Source.prototype.hasMoreData = function () {
                        return this._currentIndex < this._endIndex;
                    };
                    Source.prototype.peekSegmentType = function () {
                        var lookahead = this._string[this._currentIndex];
                        return this._pathSegTypeFromChar(lookahead);
                    };
                    Source.prototype._pathSegTypeFromChar = function (lookahead) {
                        switch (lookahead) {
                            case "Z":
                            case "z":
                                return window.SVGPathSeg.PATHSEG_CLOSEPATH;
                            case "M":
                                return window.SVGPathSeg.PATHSEG_MOVETO_ABS;
                            case "m":
                                return window.SVGPathSeg.PATHSEG_MOVETO_REL;
                            case "L":
                                return window.SVGPathSeg.PATHSEG_LINETO_ABS;
                            case "l":
                                return window.SVGPathSeg.PATHSEG_LINETO_REL;
                            case "C":
                                return window.SVGPathSeg.PATHSEG_CURVETO_CUBIC_ABS;
                            case "c":
                                return window.SVGPathSeg.PATHSEG_CURVETO_CUBIC_REL;
                            case "Q":
                                return window.SVGPathSeg.PATHSEG_CURVETO_QUADRATIC_ABS;
                            case "q":
                                return window.SVGPathSeg.PATHSEG_CURVETO_QUADRATIC_REL;
                            case "A":
                                return window.SVGPathSeg.PATHSEG_ARC_ABS;
                            case "a":
                                return window.SVGPathSeg.PATHSEG_ARC_REL;
                            case "H":
                                return window.SVGPathSeg.PATHSEG_LINETO_HORIZONTAL_ABS;
                            case "h":
                                return window.SVGPathSeg.PATHSEG_LINETO_HORIZONTAL_REL;
                            case "V":
                                return window.SVGPathSeg.PATHSEG_LINETO_VERTICAL_ABS;
                            case "v":
                                return window.SVGPathSeg.PATHSEG_LINETO_VERTICAL_REL;
                            case "S":
                                return window.SVGPathSeg.PATHSEG_CURVETO_CUBIC_SMOOTH_ABS;
                            case "s":
                                return window.SVGPathSeg.PATHSEG_CURVETO_CUBIC_SMOOTH_REL;
                            case "T":
                                return window.SVGPathSeg.PATHSEG_CURVETO_QUADRATIC_SMOOTH_ABS;
                            case "t":
                                return window.SVGPathSeg.PATHSEG_CURVETO_QUADRATIC_SMOOTH_REL;
                            default:
                                return window.SVGPathSeg.PATHSEG_UNKNOWN;
                        }
                    };
                    Source.prototype._nextCommandHelper = function (lookahead, previousCommand) {
                        if ((lookahead == "+" || lookahead == "-" || lookahead == "." || (lookahead >= "0" && lookahead <= "9")) &&
                            previousCommand != window.SVGPathSeg.PATHSEG_CLOSEPATH) {
                            if (previousCommand == window.SVGPathSeg.PATHSEG_MOVETO_ABS)
                                return window.SVGPathSeg.PATHSEG_LINETO_ABS;
                            if (previousCommand == window.SVGPathSeg.PATHSEG_MOVETO_REL)
                                return window.SVGPathSeg.PATHSEG_LINETO_REL;
                            return previousCommand;
                        }
                        return window.SVGPathSeg.PATHSEG_UNKNOWN;
                    };
                    Source.prototype.initialCommandIsMoveTo = function () {
                        if (!this.hasMoreData())
                            return true;
                        var command = this.peekSegmentType();
                        return command == window.SVGPathSeg.PATHSEG_MOVETO_ABS || command == window.SVGPathSeg.PATHSEG_MOVETO_REL;
                    };
                    Source.prototype._parseNumber = function () {
                        var exponent = 0;
                        var integer = 0;
                        var frac = 1;
                        var decimal = 0;
                        var sign = 1;
                        var expsign = 1;
                        var startIndex = this._currentIndex;
                        this._skipOptionalSpaces();
                        if (this._currentIndex < this._endIndex && this._string.charAt(this._currentIndex) == "+")
                            this._currentIndex++;
                        else if (this._currentIndex < this._endIndex && this._string.charAt(this._currentIndex) == "-") {
                            this._currentIndex++;
                            sign = -1;
                        }
                        if (this._currentIndex == this._endIndex ||
                            ((this._string.charAt(this._currentIndex) < "0" || this._string.charAt(this._currentIndex) > "9") &&
                                this._string.charAt(this._currentIndex) != "."))
                            return undefined;
                        var startIntPartIndex = this._currentIndex;
                        while (this._currentIndex < this._endIndex &&
                            this._string.charAt(this._currentIndex) >= "0" &&
                            this._string.charAt(this._currentIndex) <= "9")
                            this._currentIndex++;
                        if (this._currentIndex != startIntPartIndex) {
                            var scanIntPartIndex = this._currentIndex - 1;
                            var multiplier = 1;
                            while (scanIntPartIndex >= startIntPartIndex) {
                                integer += multiplier * (this._string.charAt(scanIntPartIndex--) - "0");
                                multiplier *= 10;
                            }
                        }
                        if (this._currentIndex < this._endIndex && this._string.charAt(this._currentIndex) == ".") {
                            this._currentIndex++;
                            if (this._currentIndex >= this._endIndex ||
                                this._string.charAt(this._currentIndex) < "0" ||
                                this._string.charAt(this._currentIndex) > "9")
                                return undefined;
                            while (this._currentIndex < this._endIndex &&
                                this._string.charAt(this._currentIndex) >= "0" &&
                                this._string.charAt(this._currentIndex) <= "9") {
                                frac *= 10;
                                decimal += (this._string.charAt(this._currentIndex) - "0") / frac;
                                this._currentIndex += 1;
                            }
                        }
                        if (this._currentIndex != startIndex &&
                            this._currentIndex + 1 < this._endIndex &&
                            (this._string.charAt(this._currentIndex) == "e" || this._string.charAt(this._currentIndex) == "E") &&
                            this._string.charAt(this._currentIndex + 1) != "x" &&
                            this._string.charAt(this._currentIndex + 1) != "m") {
                            this._currentIndex++;
                            if (this._string.charAt(this._currentIndex) == "+") {
                                this._currentIndex++;
                            }
                            else if (this._string.charAt(this._currentIndex) == "-") {
                                this._currentIndex++;
                                expsign = -1;
                            }
                            if (this._currentIndex >= this._endIndex ||
                                this._string.charAt(this._currentIndex) < "0" ||
                                this._string.charAt(this._currentIndex) > "9")
                                return undefined;
                            while (this._currentIndex < this._endIndex &&
                                this._string.charAt(this._currentIndex) >= "0" &&
                                this._string.charAt(this._currentIndex) <= "9") {
                                exponent *= 10;
                                exponent += this._string.charAt(this._currentIndex) - "0";
                                this._currentIndex++;
                            }
                        }
                        var number = integer + decimal;
                        number *= sign;
                        if (exponent)
                            number *= Math.pow(10, expsign * exponent);
                        if (startIndex == this._currentIndex)
                            return undefined;
                        this._skipOptionalSpacesOrDelimiter();
                        return number;
                    };
                    Source.prototype._parseArcFlag = function () {
                        if (this._currentIndex >= this._endIndex)
                            return undefined;
                        var flag = false;
                        var flagChar = this._string.charAt(this._currentIndex++);
                        if (flagChar == "0")
                            flag = false;
                        else if (flagChar == "1")
                            flag = true;
                        else
                            return undefined;
                        this._skipOptionalSpacesOrDelimiter();
                        return flag;
                    };
                    Source.prototype.parseSegment = function () {
                        var lookahead = this._string[this._currentIndex];
                        var command = this._pathSegTypeFromChar(lookahead);
                        if (command == window.SVGPathSeg.PATHSEG_UNKNOWN) {
                            if (this._previousCommand == window.SVGPathSeg.PATHSEG_UNKNOWN)
                                return null;
                            command = this._nextCommandHelper(lookahead, this._previousCommand);
                            if (command == window.SVGPathSeg.PATHSEG_UNKNOWN)
                                return null;
                        }
                        else {
                            this._currentIndex++;
                        }
                        this._previousCommand = command;
                        switch (command) {
                            case window.SVGPathSeg.PATHSEG_MOVETO_REL:
                                return new window.SVGPathSegMovetoRel(owningPathSegList, this._parseNumber(), this._parseNumber());
                            case window.SVGPathSeg.PATHSEG_MOVETO_ABS:
                                return new window.SVGPathSegMovetoAbs(owningPathSegList, this._parseNumber(), this._parseNumber());
                            case window.SVGPathSeg.PATHSEG_LINETO_REL:
                                return new window.SVGPathSegLinetoRel(owningPathSegList, this._parseNumber(), this._parseNumber());
                            case window.SVGPathSeg.PATHSEG_LINETO_ABS:
                                return new window.SVGPathSegLinetoAbs(owningPathSegList, this._parseNumber(), this._parseNumber());
                            case window.SVGPathSeg.PATHSEG_LINETO_HORIZONTAL_REL:
                                return new window.SVGPathSegLinetoHorizontalRel(owningPathSegList, this._parseNumber());
                            case window.SVGPathSeg.PATHSEG_LINETO_HORIZONTAL_ABS:
                                return new window.SVGPathSegLinetoHorizontalAbs(owningPathSegList, this._parseNumber());
                            case window.SVGPathSeg.PATHSEG_LINETO_VERTICAL_REL:
                                return new window.SVGPathSegLinetoVerticalRel(owningPathSegList, this._parseNumber());
                            case window.SVGPathSeg.PATHSEG_LINETO_VERTICAL_ABS:
                                return new window.SVGPathSegLinetoVerticalAbs(owningPathSegList, this._parseNumber());
                            case window.SVGPathSeg.PATHSEG_CLOSEPATH:
                                this._skipOptionalSpaces();
                                return new window.SVGPathSegClosePath(owningPathSegList);
                            case window.SVGPathSeg.PATHSEG_CURVETO_CUBIC_REL:
                                var points = {
                                    x1: this._parseNumber(),
                                    y1: this._parseNumber(),
                                    x2: this._parseNumber(),
                                    y2: this._parseNumber(),
                                    x: this._parseNumber(),
                                    y: this._parseNumber(),
                                };
                                return new window.SVGPathSegCurvetoCubicRel(owningPathSegList, points.x, points.y, points.x1, points.y1, points.x2, points.y2);
                            case window.SVGPathSeg.PATHSEG_CURVETO_CUBIC_ABS:
                                var points = {
                                    x1: this._parseNumber(),
                                    y1: this._parseNumber(),
                                    x2: this._parseNumber(),
                                    y2: this._parseNumber(),
                                    x: this._parseNumber(),
                                    y: this._parseNumber(),
                                };
                                return new window.SVGPathSegCurvetoCubicAbs(owningPathSegList, points.x, points.y, points.x1, points.y1, points.x2, points.y2);
                            case window.SVGPathSeg.PATHSEG_CURVETO_CUBIC_SMOOTH_REL:
                                var points = {
                                    x2: this._parseNumber(),
                                    y2: this._parseNumber(),
                                    x: this._parseNumber(),
                                    y: this._parseNumber(),
                                };
                                return new window.SVGPathSegCurvetoCubicSmoothRel(owningPathSegList, points.x, points.y, points.x2, points.y2);
                            case window.SVGPathSeg.PATHSEG_CURVETO_CUBIC_SMOOTH_ABS:
                                var points = {
                                    x2: this._parseNumber(),
                                    y2: this._parseNumber(),
                                    x: this._parseNumber(),
                                    y: this._parseNumber(),
                                };
                                return new window.SVGPathSegCurvetoCubicSmoothAbs(owningPathSegList, points.x, points.y, points.x2, points.y2);
                            case window.SVGPathSeg.PATHSEG_CURVETO_QUADRATIC_REL:
                                var points = {
                                    x1: this._parseNumber(),
                                    y1: this._parseNumber(),
                                    x: this._parseNumber(),
                                    y: this._parseNumber(),
                                };
                                return new window.SVGPathSegCurvetoQuadraticRel(owningPathSegList, points.x, points.y, points.x1, points.y1);
                            case window.SVGPathSeg.PATHSEG_CURVETO_QUADRATIC_ABS:
                                var points = {
                                    x1: this._parseNumber(),
                                    y1: this._parseNumber(),
                                    x: this._parseNumber(),
                                    y: this._parseNumber(),
                                };
                                return new window.SVGPathSegCurvetoQuadraticAbs(owningPathSegList, points.x, points.y, points.x1, points.y1);
                            case window.SVGPathSeg.PATHSEG_CURVETO_QUADRATIC_SMOOTH_REL:
                                return new window.SVGPathSegCurvetoQuadraticSmoothRel(owningPathSegList, this._parseNumber(), this._parseNumber());
                            case window.SVGPathSeg.PATHSEG_CURVETO_QUADRATIC_SMOOTH_ABS:
                                return new window.SVGPathSegCurvetoQuadraticSmoothAbs(owningPathSegList, this._parseNumber(), this._parseNumber());
                            case window.SVGPathSeg.PATHSEG_ARC_REL:
                                var points = {
                                    x1: this._parseNumber(),
                                    y1: this._parseNumber(),
                                    arcAngle: this._parseNumber(),
                                    arcLarge: this._parseArcFlag(),
                                    arcSweep: this._parseArcFlag(),
                                    x: this._parseNumber(),
                                    y: this._parseNumber(),
                                };
                                return new window.SVGPathSegArcRel(owningPathSegList, points.x, points.y, points.x1, points.y1, points.arcAngle, points.arcLarge, points.arcSweep);
                            case window.SVGPathSeg.PATHSEG_ARC_ABS:
                                var points = {
                                    x1: this._parseNumber(),
                                    y1: this._parseNumber(),
                                    arcAngle: this._parseNumber(),
                                    arcLarge: this._parseArcFlag(),
                                    arcSweep: this._parseArcFlag(),
                                    x: this._parseNumber(),
                                    y: this._parseNumber(),
                                };
                                return new window.SVGPathSegArcAbs(owningPathSegList, points.x, points.y, points.x1, points.y1, points.arcAngle, points.arcLarge, points.arcSweep);
                            default:
                                throw "Unknown path seg type.";
                        }
                    };
                    var builder = new Builder();
                    var source = new Source(string);
                    if (!source.initialCommandIsMoveTo())
                        return [];
                    while (source.hasMoreData()) {
                        var pathSeg = source.parseSegment();
                        if (!pathSeg)
                            return [];
                        builder.appendSegment(pathSeg);
                    }
                    return builder.pathSegList;
                };
            }
        }
        catch (e) {
            console.warn("An error occurred in tsParticles pathseg polyfill. If the Polygon Mask is not working, please open an issue here: https://github.com/matteobruni/tsparticles", e);
        }
    })();

    var pathseg = /*#__PURE__*/Object.freeze({
        __proto__: null
    });

    var plugin = createCommonjsModule(function (module, exports) {
    var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
    }) : (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
    }));
    var __setModuleDefault = (commonjsGlobal && commonjsGlobal.__setModuleDefault) || (Object.create ? (function(o, v) {
        Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
        o["default"] = v;
    });
    var __importStar = (commonjsGlobal && commonjsGlobal.__importStar) || function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
        __setModuleDefault(result, mod);
        return result;
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadPolygonMaskPlugin = void 0;




    class Plugin {
        constructor() {
            this.id = "polygonMask";
        }
        getPlugin(container) {
            return new PolygonMaskInstance_1.PolygonMaskInstance(container);
        }
        needsPlugin(options) {
            var _a, _b, _c;
            return (_b = (_a = options === null || options === void 0 ? void 0 : options.polygon) === null || _a === void 0 ? void 0 : _a.enable) !== null && _b !== void 0 ? _b : (((_c = options === null || options === void 0 ? void 0 : options.polygon) === null || _c === void 0 ? void 0 : _c.type) !== undefined && options.polygon.type !== Enums.Type.none);
        }
        loadOptions(options, source) {
            if (!this.needsPlugin(source)) {
                return;
            }
            const optionsCast = options;
            let polygonOptions = optionsCast.polygon;
            if ((polygonOptions === null || polygonOptions === void 0 ? void 0 : polygonOptions.load) === undefined) {
                optionsCast.polygon = polygonOptions = new PolygonMask_1.PolygonMask();
            }
            polygonOptions.load(source === null || source === void 0 ? void 0 : source.polygon);
        }
    }
    async function loadPolygonMaskPlugin(tsParticles) {
        if (!(0, Utils$2.isSsr)() && !window.SVGPathSeg) {
            await Promise.resolve().then(() => __importStar(pathseg));
        }
        const plugin = new Plugin();
        await tsParticles.addPlugin(plugin);
    }
    exports.loadPolygonMaskPlugin = loadPolygonMaskPlugin;
    });

    unwrapExports(plugin);
    plugin.loadPolygonMaskPlugin;

    var RollUpdater_1 = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.RollUpdater = void 0;


    function updateRoll(particle, delta) {
        const roll = particle.options.roll;
        if (!particle.roll || !roll.enable) {
            return;
        }
        const speed = particle.roll.speed * delta.factor;
        const max = 2 * Math.PI;
        particle.roll.angle += speed;
        if (particle.roll.angle > max) {
            particle.roll.angle -= max;
        }
    }
    class RollUpdater {
        init(particle) {
            const rollOpt = particle.options.roll;
            if (rollOpt.enable) {
                particle.roll = {
                    angle: Math.random() * Math.PI * 2,
                    speed: (0, Utils$2.getRangeValue)(rollOpt.speed) / 360,
                };
                if (rollOpt.backColor) {
                    particle.backColor = (0, Utils$2.colorToHsl)(rollOpt.backColor);
                }
                else if (rollOpt.darken.enable && rollOpt.enlighten.enable) {
                    const alterType = Math.random() >= 0.5 ? Enums$3.AlterType.darken : Enums$3.AlterType.enlighten;
                    particle.roll.alter = {
                        type: alterType,
                        value: alterType === Enums$3.AlterType.darken ? rollOpt.darken.value : rollOpt.enlighten.value,
                    };
                }
                else if (rollOpt.darken.enable) {
                    particle.roll.alter = {
                        type: Enums$3.AlterType.darken,
                        value: rollOpt.darken.value,
                    };
                }
                else if (rollOpt.enlighten.enable) {
                    particle.roll.alter = {
                        type: Enums$3.AlterType.enlighten,
                        value: rollOpt.enlighten.value,
                    };
                }
            }
            else {
                particle.roll = { angle: 0, speed: 0 };
            }
        }
        isEnabled(particle) {
            const roll = particle.options.roll;
            return !particle.destroyed && !particle.spawning && roll.enable;
        }
        update(particle, delta) {
            if (!this.isEnabled(particle)) {
                return;
            }
            updateRoll(particle, delta);
        }
    }
    exports.RollUpdater = RollUpdater;
    });

    unwrapExports(RollUpdater_1);
    RollUpdater_1.RollUpdater;

    var Roll = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadRollUpdater = void 0;

    async function loadRollUpdater(tsParticles) {
        await tsParticles.addParticleUpdater("roll", () => new RollUpdater_1.RollUpdater());
    }
    exports.loadRollUpdater = loadRollUpdater;
    });

    unwrapExports(Roll);
    Roll.loadRollUpdater;

    var full = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadFull = void 0;








    async function loadFull(tsParticles) {
        await (0, slim.loadSlim)(tsParticles);
        await (0, Trail.loadExternalTrailInteraction)(tsParticles);
        await (0, Roll.loadRollUpdater)(tsParticles);
        await (0, Tilt.loadTiltUpdater)(tsParticles);
        await (0, Wobble.loadWobbleUpdater)(tsParticles);
        await (0, plugin$2.loadAbsorbersPlugin)(tsParticles);
        await (0, plugin$1.loadEmittersPlugin)(tsParticles);
        await (0, plugin.loadPolygonMaskPlugin)(tsParticles);
    }
    exports.loadFull = loadFull;
    });

    unwrapExports(full);
    full.loadFull;

    var RangeValue = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(RangeValue);

    var RecursivePartial = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(RecursivePartial);

    var ShapeData = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(ShapeData);

    var ShapeDrawerFunctions = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(ShapeDrawerFunctions);

    var SingleOrMultiple = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(SingleOrMultiple);

    var PathOptions = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(PathOptions);

    var Types = createCommonjsModule(function (module, exports) {
    var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
    }) : (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
    }));
    var __exportStar = (commonjsGlobal && commonjsGlobal.__exportStar) || function(m, exports) {
        for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    __exportStar(RangeValue, exports);
    __exportStar(RecursivePartial, exports);
    __exportStar(ShapeData, exports);
    __exportStar(ShapeDrawerFunctions, exports);
    __exportStar(SingleOrMultiple, exports);
    __exportStar(PathOptions, exports);
    });

    unwrapExports(Types);

    var Colors = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(Colors);

    var Gradients = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(Gradients);

    var IAttract = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IAttract);

    var IBounds = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IBounds);

    var IBubble = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IBubble);

    var IBubbleParticleData = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IBubbleParticleData);

    var ICircleBouncer = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(ICircleBouncer);

    var IContainerInteractivity = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IContainerInteractivity);

    var IContainerPlugin = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IContainerPlugin);

    var ICoordinates = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(ICoordinates);

    var IDelta = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IDelta);

    var IDimension = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IDimension);

    var IDistance = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IDistance);

    var IExternalInteractor = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IExternalInteractor);

    var IInteractor = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IInteractor);

    var IMouseData = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IMouseData);

    var IMovePathGenerator = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IMovePathGenerator);

    var IParticle = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IParticle);

    var IParticleGradientAnimation = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IParticleGradientAnimation);

    var IParticleGradientColorAnimation = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IParticleGradientColorAnimation);

    var IParticleHslAnimation = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IParticleHslAnimation);

    var IParticleLife = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IParticleLife);

    var IParticleLoops = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IParticleLoops);

    var IParticleRetinaProps = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IParticleRetinaProps);

    var IParticleSpin = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IParticleSpin);

    var IParticleUpdater = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IParticleUpdater);

    var IParticleValueAnimation = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IParticleValueAnimation);

    var IParticlesInteractor = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IParticlesInteractor);

    var IPlugin = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IPlugin);

    var IRangeValue = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IRangeValue);

    var IRectSideResult = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IRectSideResult);

    var IRepulse = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IRepulse);

    var IShapeDrawer = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IShapeDrawer);

    var IShapeValues = createCommonjsModule(function (module, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    });

    unwrapExports(IShapeValues);

    var Interfaces = createCommonjsModule(function (module, exports) {
    var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
    }) : (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
    }));
    var __exportStar = (commonjsGlobal && commonjsGlobal.__exportStar) || function(m, exports) {
        for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    __exportStar(Colors, exports);
    __exportStar(Gradients, exports);
    __exportStar(IAttract, exports);
    __exportStar(IBounds, exports);
    __exportStar(IBubble, exports);
    __exportStar(IBubbleParticleData, exports);
    __exportStar(ICircleBouncer, exports);
    __exportStar(IContainerInteractivity, exports);
    __exportStar(IContainerPlugin, exports);
    __exportStar(ICoordinates, exports);
    __exportStar(IDelta, exports);
    __exportStar(IDimension, exports);
    __exportStar(IDistance, exports);
    __exportStar(IExternalInteractor, exports);
    __exportStar(IInteractor, exports);
    __exportStar(IMouseData, exports);
    __exportStar(IMovePathGenerator, exports);
    __exportStar(IParticle, exports);
    __exportStar(IParticleGradientAnimation, exports);
    __exportStar(IParticleGradientColorAnimation, exports);
    __exportStar(IParticleHslAnimation, exports);
    __exportStar(IParticleLife, exports);
    __exportStar(IParticleLoops, exports);
    __exportStar(IParticleRetinaProps, exports);
    __exportStar(IParticleSpin, exports);
    __exportStar(IParticleUpdater, exports);
    __exportStar(IParticleValueAnimation, exports);
    __exportStar(IParticlesInteractor, exports);
    __exportStar(IPlugin, exports);
    __exportStar(IRangeValue, exports);
    __exportStar(IRectSideResult, exports);
    __exportStar(IRepulse, exports);
    __exportStar(IShapeDrawer, exports);
    __exportStar(IShapeValues, exports);
    });

    unwrapExports(Interfaces);

    var tsparticles = createCommonjsModule(function (module, exports) {
    var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
    }) : (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
    }));
    var __exportStar = (commonjsGlobal && commonjsGlobal.__exportStar) || function(m, exports) {
        for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.tsParticles = exports.pJSDom = exports.particlesJS = exports.Main = exports.Rectangle = exports.Point = exports.Constants = exports.CircleWarp = exports.Circle = void 0;


    Object.defineProperty(exports, "Main", { enumerable: true, get: function () { return main.Main; } });

    Object.defineProperty(exports, "Circle", { enumerable: true, get: function () { return Utils$2.Circle; } });
    Object.defineProperty(exports, "CircleWarp", { enumerable: true, get: function () { return Utils$2.CircleWarp; } });
    Object.defineProperty(exports, "Constants", { enumerable: true, get: function () { return Utils$2.Constants; } });
    Object.defineProperty(exports, "Point", { enumerable: true, get: function () { return Utils$2.Point; } });
    Object.defineProperty(exports, "Rectangle", { enumerable: true, get: function () { return Utils$2.Rectangle; } });

    const tsParticles = new main.Main();
    exports.tsParticles = tsParticles;
    tsParticles.init();
    const { particlesJS, pJSDom } = (0, pjs.initPjs)(tsParticles);
    exports.particlesJS = particlesJS;
    exports.pJSDom = pJSDom;
    (0, full.loadFull)(tsParticles);
    __exportStar(Vector_1, exports);
    __exportStar(Container_1, exports);
    __exportStar(Enums$3, exports);
    __exportStar(Enums$2, exports);
    __exportStar(Enums$1, exports);
    __exportStar(Enums, exports);
    __exportStar(CanvasUtils, exports);
    __exportStar(ColorUtils, exports);
    __exportStar(NumberUtils, exports);
    __exportStar(Utils$3, exports);
    __exportStar(Types, exports);
    __exportStar(Interfaces, exports);
    __exportStar(Particle_1, exports);
    __exportStar(ExternalInteractorBase_1, exports);
    __exportStar(ParticlesInteractorBase_1, exports);
    });

    var index = unwrapExports(tsparticles);
    var tsparticles_1 = tsparticles.tsParticles;
    tsparticles.pJSDom;
    tsparticles.particlesJS;
    tsparticles.Main;
    tsparticles.Rectangle;
    tsparticles.Point;
    tsparticles.Constants;
    tsparticles.CircleWarp;
    tsparticles.Circle;

    /* node_modules\svelte-particles\src\Particles.svelte generated by Svelte v3.44.2 */

    const { console: console_1 } = globals;
    const file$a = "node_modules\\svelte-particles\\src\\Particles.svelte";

    function create_fragment$c(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			this.h();
    		},
    		l: function claim(nodes) {
    			div = claim_element(nodes, "DIV", { id: true });
    			children(div).forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(div, "id", /*id*/ ctx[0]);
    			add_location(div, file$a, 53, 0, 1201);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, div, anchor);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*id*/ 1) {
    				attr_dev(div, "id", /*id*/ ctx[0]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$c.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const particlesInitEvent = "particlesInit";
    const particlesLoadedEvent = "particlesLoaded";

    function instance$c($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Particles', slots, []);
    	let { options = {} } = $$props;
    	let { url = "" } = $$props;
    	let { id = "tsparticles" } = $$props;
    	const dispatch = createEventDispatcher();
    	let oldId = id;

    	afterUpdate(() => {
    		tsparticles_1.init();
    		dispatch(particlesInitEvent, tsparticles_1);

    		if (oldId) {
    			const oldContainer = tsparticles_1.dom().find(c => c.id === oldId);

    			if (oldContainer) {
    				oldContainer.destroy();
    			}
    		}

    		if (id) {
    			const cb = container => {
    				dispatch(particlesLoadedEvent, { particles: container });
    				oldId = id;
    			};

    			if (url) {
    				tsparticles_1.loadJSON(id, url).then(cb);
    			} else if (options) {
    				tsparticles_1.load(id, options).then(cb);
    			} else {
    				console.error("You must specify options or url to load tsParticles");
    			}
    		} else {
    			dispatch(particlesLoadedEvent, { particles: undefined });
    		}
    	});

    	const writable_props = ['options', 'url', 'id'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1.warn(`<Particles> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('options' in $$props) $$invalidate(1, options = $$props.options);
    		if ('url' in $$props) $$invalidate(2, url = $$props.url);
    		if ('id' in $$props) $$invalidate(0, id = $$props.id);
    	};

    	$$self.$capture_state = () => ({
    		afterUpdate,
    		createEventDispatcher,
    		Container: index.Container,
    		tsParticles: tsparticles_1,
    		options,
    		url,
    		id,
    		dispatch,
    		particlesInitEvent,
    		particlesLoadedEvent,
    		oldId
    	});

    	$$self.$inject_state = $$props => {
    		if ('options' in $$props) $$invalidate(1, options = $$props.options);
    		if ('url' in $$props) $$invalidate(2, url = $$props.url);
    		if ('id' in $$props) $$invalidate(0, id = $$props.id);
    		if ('oldId' in $$props) oldId = $$props.oldId;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [id, options, url];
    }

    class Particles extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$c, create_fragment$c, safe_not_equal, { options: 1, url: 2, id: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Particles",
    			options,
    			id: create_fragment$c.name
    		});
    	}

    	get options() {
    		return this.$$.ctx[1];
    	}

    	set options(options) {
    		this.$$set({ options });
    		flush();
    	}

    	get url() {
    		return this.$$.ctx[2];
    	}

    	set url(url) {
    		this.$$set({ url });
    		flush();
    	}

    	get id() {
    		return this.$$.ctx[0];
    	}

    	set id(id) {
    		this.$$set({ id });
    		flush();
    	}
    }

    /* src\effects\particles.svelte generated by Svelte v3.44.2 */

    const particlesConfig = {
    	fpsLimit: 60,
    	particles: {
    		color: { value: "#FF0000" },
    		move: {
    			attract: {
    				enable: false,
    				rotate: { x: 2000, y: 2000 }
    			},
    			direction: "none",
    			enable: true,
    			outModes: { default: "destroy" },
    			path: {
    				clamp: false,
    				enable: true,
    				delay: { value: 0 },
    				generator: "seaAnemone"
    			},
    			random: false,
    			speed: 2,
    			straight: false,
    			trail: {
    				fillColor: "#000",
    				length: 30,
    				enable: true
    			}
    		},
    		number: {
    			density: { enable: true, area: 800 },
    			value: 0,
    			limit: 300
    		},
    		opacity: { value: 1 },
    		shape: { type: "circle" },
    		size: {
    			value: 10,
    			animation: {
    				count: 1,
    				startValue: "min",
    				enable: true,
    				minimumValue: 1,
    				speed: 10,
    				sync: true
    			}
    		}
    	},
    	background: { color: "#000" },
    	detectRetina: true,
    	emitters: {
    		direction: "none",
    		rate: { quantity: 10, delay: 0.3 },
    		size: { width: 0, height: 0, mode: "precise" },
    		spawnColor: {
    			value: "#ff0000",
    			animation: {
    				h: {
    					enable: true,
    					offset: { min: -1.4, max: 1.4 },
    					speed: 5,
    					sync: false
    				},
    				l: {
    					enable: true,
    					offset: { min: 20, max: 80 },
    					speed: 0,
    					sync: false
    				}
    			}
    		},
    		position: { x: 50, y: 50 }
    	}
    };

    /* src\routes\Login.svelte generated by Svelte v3.44.2 */
    const file$9 = "src\\routes\\Login.svelte";

    function create_fragment$b(ctx) {
    	let particles;
    	let t0;
    	let main;
    	let h2;
    	let t1;
    	let t2;
    	let form;
    	let div0;
    	let label0;
    	let t3;
    	let t4;
    	let input0;
    	let t5;
    	let div1;
    	let label1;
    	let t6;
    	let t7;
    	let input1;
    	let t8;
    	let div2;
    	let button;
    	let t9;
    	let t10;
    	let a;
    	let t11;
    	let t12;
    	let footer;
    	let current;

    	particles = new Particles({
    			props: {
    				id: "tsparticles",
    				options: particlesConfig
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(particles.$$.fragment);
    			t0 = space();
    			main = element("main");
    			h2 = element("h2");
    			t1 = text("Login");
    			t2 = space();
    			form = element("form");
    			div0 = element("div");
    			label0 = element("label");
    			t3 = text("Username");
    			t4 = space();
    			input0 = element("input");
    			t5 = space();
    			div1 = element("div");
    			label1 = element("label");
    			t6 = text("Password");
    			t7 = space();
    			input1 = element("input");
    			t8 = space();
    			div2 = element("div");
    			button = element("button");
    			t9 = text("Submit");
    			t10 = space();
    			a = element("a");
    			t11 = text("Register");
    			t12 = space();
    			footer = element("footer");
    			this.h();
    		},
    		l: function claim(nodes) {
    			claim_component(particles.$$.fragment, nodes);
    			t0 = claim_space(nodes);
    			main = claim_element(nodes, "MAIN", { class: true });
    			var main_nodes = children(main);
    			h2 = claim_element(main_nodes, "H2", { class: true });
    			var h2_nodes = children(h2);
    			t1 = claim_text(h2_nodes, "Login");
    			h2_nodes.forEach(detach_dev);
    			t2 = claim_space(main_nodes);
    			form = claim_element(main_nodes, "FORM", { class: true });
    			var form_nodes = children(form);
    			div0 = claim_element(form_nodes, "DIV", { class: true });
    			var div0_nodes = children(div0);
    			label0 = claim_element(div0_nodes, "LABEL", { for: true, class: true });
    			var label0_nodes = children(label0);
    			t3 = claim_text(label0_nodes, "Username");
    			label0_nodes.forEach(detach_dev);
    			t4 = claim_space(div0_nodes);

    			input0 = claim_element(div0_nodes, "INPUT", {
    				type: true,
    				name: true,
    				id: true,
    				placeholder: true,
    				class: true
    			});

    			div0_nodes.forEach(detach_dev);
    			t5 = claim_space(form_nodes);
    			div1 = claim_element(form_nodes, "DIV", { class: true });
    			var div1_nodes = children(div1);
    			label1 = claim_element(div1_nodes, "LABEL", { for: true, class: true });
    			var label1_nodes = children(label1);
    			t6 = claim_text(label1_nodes, "Password");
    			label1_nodes.forEach(detach_dev);
    			t7 = claim_space(div1_nodes);

    			input1 = claim_element(div1_nodes, "INPUT", {
    				type: true,
    				name: true,
    				id: true,
    				placeholder: true,
    				class: true
    			});

    			div1_nodes.forEach(detach_dev);
    			t8 = claim_space(form_nodes);
    			div2 = claim_element(form_nodes, "DIV", { class: true });
    			var div2_nodes = children(div2);

    			button = claim_element(div2_nodes, "BUTTON", {
    				type: true,
    				name: true,
    				style: true,
    				class: true
    			});

    			var button_nodes = children(button);
    			t9 = claim_text(button_nodes, "Submit");
    			button_nodes.forEach(detach_dev);
    			t10 = claim_space(div2_nodes);
    			a = claim_element(div2_nodes, "A", { class: true, href: true, style: true });
    			var a_nodes = children(a);
    			t11 = claim_text(a_nodes, "Register");
    			a_nodes.forEach(detach_dev);
    			div2_nodes.forEach(detach_dev);
    			form_nodes.forEach(detach_dev);
    			main_nodes.forEach(detach_dev);
    			t12 = claim_space(nodes);
    			footer = claim_element(nodes, "FOOTER", { class: true });
    			var footer_nodes = children(footer);
    			footer_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(h2, "class", "svelte-jggw3");
    			add_location(h2, file$9, 82, 4, 1822);
    			attr_dev(label0, "for", "userName");
    			attr_dev(label0, "class", "svelte-jggw3");
    			add_location(label0, file$9, 85, 12, 1891);
    			attr_dev(input0, "type", "text");
    			attr_dev(input0, "name", "userName");
    			attr_dev(input0, "id", "userName");
    			attr_dev(input0, "placeholder", "type your username");
    			input0.required = true;
    			attr_dev(input0, "class", "svelte-jggw3");
    			add_location(input0, file$9, 86, 12, 1942);
    			attr_dev(div0, "class", "inputBox svelte-jggw3");
    			add_location(div0, file$9, 84, 8, 1856);
    			attr_dev(label1, "for", "userPassword");
    			attr_dev(label1, "class", "svelte-jggw3");
    			add_location(label1, file$9, 89, 12, 2093);
    			attr_dev(input1, "type", "password");
    			attr_dev(input1, "name", "userPassword");
    			attr_dev(input1, "id", "userPassword");
    			attr_dev(input1, "placeholder", "type your password");
    			input1.required = true;
    			attr_dev(input1, "class", "svelte-jggw3");
    			add_location(input1, file$9, 90, 12, 2148);
    			attr_dev(div1, "class", "inputBox svelte-jggw3");
    			add_location(div1, file$9, 88, 8, 2058);
    			attr_dev(button, "type", "submit");
    			attr_dev(button, "name", "");
    			set_style(button, "float", "left");
    			attr_dev(button, "class", "svelte-jggw3");
    			add_location(button, file$9, 94, 12, 2313);
    			attr_dev(a, "class", "button svelte-jggw3");
    			attr_dev(a, "href", "/register");
    			set_style(a, "float", "left");
    			add_location(a, file$9, 95, 12, 2392);
    			attr_dev(div2, "class", "svelte-jggw3");
    			add_location(div2, file$9, 93, 8, 2295);
    			attr_dev(form, "class", "svelte-jggw3");
    			add_location(form, file$9, 83, 4, 1841);
    			attr_dev(main, "class", "box svelte-jggw3");
    			add_location(main, file$9, 81, 0, 1799);
    			attr_dev(footer, "class", "svelte-jggw3");
    			add_location(footer, file$9, 99, 0, 2496);
    		},
    		m: function mount(target, anchor) {
    			mount_component(particles, target, anchor);
    			insert_hydration_dev(target, t0, anchor);
    			insert_hydration_dev(target, main, anchor);
    			append_hydration_dev(main, h2);
    			append_hydration_dev(h2, t1);
    			append_hydration_dev(main, t2);
    			append_hydration_dev(main, form);
    			append_hydration_dev(form, div0);
    			append_hydration_dev(div0, label0);
    			append_hydration_dev(label0, t3);
    			append_hydration_dev(div0, t4);
    			append_hydration_dev(div0, input0);
    			append_hydration_dev(form, t5);
    			append_hydration_dev(form, div1);
    			append_hydration_dev(div1, label1);
    			append_hydration_dev(label1, t6);
    			append_hydration_dev(div1, t7);
    			append_hydration_dev(div1, input1);
    			append_hydration_dev(form, t8);
    			append_hydration_dev(form, div2);
    			append_hydration_dev(div2, button);
    			append_hydration_dev(button, t9);
    			append_hydration_dev(div2, t10);
    			append_hydration_dev(div2, a);
    			append_hydration_dev(a, t11);
    			insert_hydration_dev(target, t12, anchor);
    			insert_hydration_dev(target, footer, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(particles.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(particles.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(particles, detaching);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(main);
    			if (detaching) detach_dev(t12);
    			if (detaching) detach_dev(footer);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$b.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$b($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Login', slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Login> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({ Particles, particlesConfig });
    	return [];
    }

    class Login extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$b, create_fragment$b, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Login",
    			options,
    			id: create_fragment$b.name
    		});
    	}
    }

    /* src\routes\Register.svelte generated by Svelte v3.44.2 */
    const file$8 = "src\\routes\\Register.svelte";

    function create_fragment$a(ctx) {
    	let particles;
    	let t0;
    	let main;
    	let h2;
    	let t1;
    	let t2;
    	let form;
    	let div0;
    	let label0;
    	let t3;
    	let t4;
    	let input0;
    	let t5;
    	let div1;
    	let label1;
    	let t6;
    	let t7;
    	let input1;
    	let t8;
    	let div2;
    	let label2;
    	let t9;
    	let t10;
    	let input2;
    	let t11;
    	let button;
    	let t12;
    	let t13;
    	let a;
    	let t14;
    	let t15;
    	let footer;
    	let current;

    	particles = new Particles({
    			props: {
    				id: "tsparticles",
    				options: particlesConfig
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(particles.$$.fragment);
    			t0 = space();
    			main = element("main");
    			h2 = element("h2");
    			t1 = text("Register");
    			t2 = space();
    			form = element("form");
    			div0 = element("div");
    			label0 = element("label");
    			t3 = text("Username");
    			t4 = space();
    			input0 = element("input");
    			t5 = space();
    			div1 = element("div");
    			label1 = element("label");
    			t6 = text("Password");
    			t7 = space();
    			input1 = element("input");
    			t8 = space();
    			div2 = element("div");
    			label2 = element("label");
    			t9 = text("Confirm Password");
    			t10 = space();
    			input2 = element("input");
    			t11 = space();
    			button = element("button");
    			t12 = text("Submit");
    			t13 = space();
    			a = element("a");
    			t14 = text("Login");
    			t15 = space();
    			footer = element("footer");
    			this.h();
    		},
    		l: function claim(nodes) {
    			claim_component(particles.$$.fragment, nodes);
    			t0 = claim_space(nodes);
    			main = claim_element(nodes, "MAIN", { class: true });
    			var main_nodes = children(main);
    			h2 = claim_element(main_nodes, "H2", { class: true });
    			var h2_nodes = children(h2);
    			t1 = claim_text(h2_nodes, "Register");
    			h2_nodes.forEach(detach_dev);
    			t2 = claim_space(main_nodes);
    			form = claim_element(main_nodes, "FORM", { class: true });
    			var form_nodes = children(form);
    			div0 = claim_element(form_nodes, "DIV", { class: true });
    			var div0_nodes = children(div0);
    			label0 = claim_element(div0_nodes, "LABEL", { for: true, class: true });
    			var label0_nodes = children(label0);
    			t3 = claim_text(label0_nodes, "Username");
    			label0_nodes.forEach(detach_dev);
    			t4 = claim_space(div0_nodes);

    			input0 = claim_element(div0_nodes, "INPUT", {
    				type: true,
    				name: true,
    				id: true,
    				placeholder: true,
    				class: true
    			});

    			div0_nodes.forEach(detach_dev);
    			t5 = claim_space(form_nodes);
    			div1 = claim_element(form_nodes, "DIV", { class: true });
    			var div1_nodes = children(div1);
    			label1 = claim_element(div1_nodes, "LABEL", { for: true, class: true });
    			var label1_nodes = children(label1);
    			t6 = claim_text(label1_nodes, "Password");
    			label1_nodes.forEach(detach_dev);
    			t7 = claim_space(div1_nodes);

    			input1 = claim_element(div1_nodes, "INPUT", {
    				type: true,
    				name: true,
    				id: true,
    				placeholder: true,
    				class: true
    			});

    			div1_nodes.forEach(detach_dev);
    			t8 = claim_space(form_nodes);
    			div2 = claim_element(form_nodes, "DIV", { class: true });
    			var div2_nodes = children(div2);
    			label2 = claim_element(div2_nodes, "LABEL", { for: true, class: true });
    			var label2_nodes = children(label2);
    			t9 = claim_text(label2_nodes, "Confirm Password");
    			label2_nodes.forEach(detach_dev);
    			t10 = claim_space(div2_nodes);

    			input2 = claim_element(div2_nodes, "INPUT", {
    				type: true,
    				name: true,
    				id: true,
    				placeholder: true,
    				class: true
    			});

    			div2_nodes.forEach(detach_dev);
    			t11 = claim_space(form_nodes);

    			button = claim_element(form_nodes, "BUTTON", {
    				type: true,
    				name: true,
    				style: true,
    				class: true
    			});

    			var button_nodes = children(button);
    			t12 = claim_text(button_nodes, "Submit");
    			button_nodes.forEach(detach_dev);
    			t13 = claim_space(form_nodes);
    			a = claim_element(form_nodes, "A", { class: true, href: true, style: true });
    			var a_nodes = children(a);
    			t14 = claim_text(a_nodes, "Login");
    			a_nodes.forEach(detach_dev);
    			form_nodes.forEach(detach_dev);
    			main_nodes.forEach(detach_dev);
    			t15 = claim_space(nodes);
    			footer = claim_element(nodes, "FOOTER", { class: true });
    			var footer_nodes = children(footer);
    			footer_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(h2, "class", "svelte-1hranv7");
    			add_location(h2, file$8, 82, 4, 1820);
    			attr_dev(label0, "for", "userName");
    			attr_dev(label0, "class", "svelte-1hranv7");
    			add_location(label0, file$8, 85, 12, 1892);
    			attr_dev(input0, "type", "text");
    			attr_dev(input0, "name", "userName");
    			attr_dev(input0, "id", "userName");
    			attr_dev(input0, "placeholder", "type your username");
    			input0.required = true;
    			attr_dev(input0, "class", "svelte-1hranv7");
    			add_location(input0, file$8, 86, 12, 1943);
    			attr_dev(div0, "class", "inputBox svelte-1hranv7");
    			add_location(div0, file$8, 84, 8, 1857);
    			attr_dev(label1, "for", "userPassword");
    			attr_dev(label1, "class", "svelte-1hranv7");
    			add_location(label1, file$8, 89, 12, 2094);
    			attr_dev(input1, "type", "password");
    			attr_dev(input1, "name", "userPassword");
    			attr_dev(input1, "id", "userPassword");
    			attr_dev(input1, "placeholder", "type your password");
    			input1.required = true;
    			attr_dev(input1, "class", "svelte-1hranv7");
    			add_location(input1, file$8, 90, 12, 2149);
    			attr_dev(div1, "class", "inputBox svelte-1hranv7");
    			add_location(div1, file$8, 88, 8, 2059);
    			attr_dev(label2, "for", "userConfirmPassword");
    			attr_dev(label2, "class", "svelte-1hranv7");
    			add_location(label2, file$8, 94, 12, 2331);
    			attr_dev(input2, "type", "password");
    			attr_dev(input2, "name", "userPassword");
    			attr_dev(input2, "id", "userConfirmPassword");
    			attr_dev(input2, "placeholder", "confirm your password");
    			input2.required = true;
    			attr_dev(input2, "class", "svelte-1hranv7");
    			add_location(input2, file$8, 95, 12, 2401);
    			attr_dev(div2, "class", "inputBox svelte-1hranv7");
    			add_location(div2, file$8, 93, 8, 2296);
    			attr_dev(button, "type", "submit");
    			attr_dev(button, "name", "");
    			set_style(button, "float", "left");
    			attr_dev(button, "class", "svelte-1hranv7");
    			add_location(button, file$8, 98, 8, 2558);
    			attr_dev(a, "class", "button svelte-1hranv7");
    			attr_dev(a, "href", "/");
    			set_style(a, "float", "left");
    			add_location(a, file$8, 99, 8, 2633);
    			attr_dev(form, "class", "svelte-1hranv7");
    			add_location(form, file$8, 83, 4, 1842);
    			attr_dev(main, "class", "box svelte-1hranv7");
    			add_location(main, file$8, 81, 0, 1797);
    			attr_dev(footer, "class", "svelte-1hranv7");
    			add_location(footer, file$8, 102, 0, 2711);
    		},
    		m: function mount(target, anchor) {
    			mount_component(particles, target, anchor);
    			insert_hydration_dev(target, t0, anchor);
    			insert_hydration_dev(target, main, anchor);
    			append_hydration_dev(main, h2);
    			append_hydration_dev(h2, t1);
    			append_hydration_dev(main, t2);
    			append_hydration_dev(main, form);
    			append_hydration_dev(form, div0);
    			append_hydration_dev(div0, label0);
    			append_hydration_dev(label0, t3);
    			append_hydration_dev(div0, t4);
    			append_hydration_dev(div0, input0);
    			append_hydration_dev(form, t5);
    			append_hydration_dev(form, div1);
    			append_hydration_dev(div1, label1);
    			append_hydration_dev(label1, t6);
    			append_hydration_dev(div1, t7);
    			append_hydration_dev(div1, input1);
    			append_hydration_dev(form, t8);
    			append_hydration_dev(form, div2);
    			append_hydration_dev(div2, label2);
    			append_hydration_dev(label2, t9);
    			append_hydration_dev(div2, t10);
    			append_hydration_dev(div2, input2);
    			append_hydration_dev(form, t11);
    			append_hydration_dev(form, button);
    			append_hydration_dev(button, t12);
    			append_hydration_dev(form, t13);
    			append_hydration_dev(form, a);
    			append_hydration_dev(a, t14);
    			insert_hydration_dev(target, t15, anchor);
    			insert_hydration_dev(target, footer, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(particles.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(particles.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(particles, detaching);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(main);
    			if (detaching) detach_dev(t15);
    			if (detaching) detach_dev(footer);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$a.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$a($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Register', slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Register> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({ Particles, particlesConfig });
    	return [];
    }

    class Register extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$a, create_fragment$a, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Register",
    			options,
    			id: create_fragment$a.name
    		});
    	}
    }

    const parseNumber = parseFloat;

    function joinCss(obj, separator = ';') {
      let texts;
      if (Array.isArray(obj)) {
        texts = obj.filter((text) => text);
      } else {
        texts = [];
        for (const prop in obj) {
          if (obj[prop]) {
            texts.push(`${prop}:${obj[prop]}`);
          }
        }
      }
      return texts.join(separator);
    }

    function getStyles(style, size, pull, fw) {
      let float;
      let width;
      const height = '1em';
      let lineHeight;
      let fontSize;
      let textAlign;
      let verticalAlign = '-.125em';
      const overflow = 'visible';

      if (fw) {
        textAlign = 'center';
        width = '1.25em';
      }

      if (pull) {
        float = pull;
      }

      if (size) {
        if (size == 'lg') {
          fontSize = '1.33333em';
          lineHeight = '.75em';
          verticalAlign = '-.225em';
        } else if (size == 'xs') {
          fontSize = '.75em';
        } else if (size == 'sm') {
          fontSize = '.875em';
        } else {
          fontSize = size.replace('x', 'em');
        }
      }

      return joinCss([
        joinCss({
          float,
          width,
          height,
          'line-height': lineHeight,
          'font-size': fontSize,
          'text-align': textAlign,
          'vertical-align': verticalAlign,
          'transform-origin': 'center',
          overflow,
        }),
        style,
      ]);
    }

    function getTransform(
      scale,
      translateX,
      translateY,
      rotate,
      flip,
      translateTimes = 1,
      translateUnit = '',
      rotateUnit = '',
    ) {
      let flipX = 1;
      let flipY = 1;

      if (flip) {
        if (flip == 'horizontal') {
          flipX = -1;
        } else if (flip == 'vertical') {
          flipY = -1;
        } else {
          flipX = flipY = -1;
        }
      }

      return joinCss(
        [
          `translate(${parseNumber(translateX) * translateTimes}${translateUnit},${parseNumber(translateY) * translateTimes}${translateUnit})`,
          `scale(${flipX * parseNumber(scale)},${flipY * parseNumber(scale)})`,
          rotate && `rotate(${rotate}${rotateUnit})`,
        ],
        ' ',
      );
    }

    /* node_modules\svelte-fa\src\fa.svelte generated by Svelte v3.44.2 */
    const file$7 = "node_modules\\svelte-fa\\src\\fa.svelte";

    // (78:0) {#if i[4]}
    function create_if_block$7(ctx) {
    	let svg;
    	let g1;
    	let g0;
    	let g1_transform_value;
    	let g1_transform_origin_value;
    	let svg_class_value;
    	let svg_viewBox_value;

    	function select_block_type(ctx, dirty) {
    		if (typeof /*i*/ ctx[7][4] == 'string') return create_if_block_1$2;
    		return create_else_block$4;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			g1 = svg_element("g");
    			g0 = svg_element("g");
    			if_block.c();
    			this.h();
    		},
    		l: function claim(nodes) {
    			svg = claim_svg_element(nodes, "svg", {
    				id: true,
    				class: true,
    				style: true,
    				viewBox: true,
    				"aria-hidden": true,
    				role: true,
    				xmlns: true
    			});

    			var svg_nodes = children(svg);

    			g1 = claim_svg_element(svg_nodes, "g", {
    				transform: true,
    				"transform-origin": true
    			});

    			var g1_nodes = children(g1);
    			g0 = claim_svg_element(g1_nodes, "g", { transform: true });
    			var g0_nodes = children(g0);
    			if_block.l(g0_nodes);
    			g0_nodes.forEach(detach_dev);
    			g1_nodes.forEach(detach_dev);
    			svg_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(g0, "transform", /*transform*/ ctx[10]);
    			add_location(g0, file$7, 91, 6, 1469);
    			attr_dev(g1, "transform", g1_transform_value = `translate(${/*i*/ ctx[7][0] / 2} ${/*i*/ ctx[7][1] / 2})`);
    			attr_dev(g1, "transform-origin", g1_transform_origin_value = `${/*i*/ ctx[7][0] / 4} 0`);
    			add_location(g1, file$7, 87, 4, 1358);
    			attr_dev(svg, "id", /*id*/ ctx[0]);
    			attr_dev(svg, "class", svg_class_value = "" + (null_to_empty(/*c*/ ctx[8]) + " svelte-1cj2gr0"));
    			attr_dev(svg, "style", /*s*/ ctx[9]);
    			attr_dev(svg, "viewBox", svg_viewBox_value = `0 0 ${/*i*/ ctx[7][0]} ${/*i*/ ctx[7][1]}`);
    			attr_dev(svg, "aria-hidden", "true");
    			attr_dev(svg, "role", "img");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			add_location(svg, file$7, 78, 2, 1195);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, svg, anchor);
    			append_hydration_dev(svg, g1);
    			append_hydration_dev(g1, g0);
    			if_block.m(g0, null);
    		},
    		p: function update(ctx, dirty) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(g0, null);
    				}
    			}

    			if (dirty & /*transform*/ 1024) {
    				attr_dev(g0, "transform", /*transform*/ ctx[10]);
    			}

    			if (dirty & /*i*/ 128 && g1_transform_value !== (g1_transform_value = `translate(${/*i*/ ctx[7][0] / 2} ${/*i*/ ctx[7][1] / 2})`)) {
    				attr_dev(g1, "transform", g1_transform_value);
    			}

    			if (dirty & /*i*/ 128 && g1_transform_origin_value !== (g1_transform_origin_value = `${/*i*/ ctx[7][0] / 4} 0`)) {
    				attr_dev(g1, "transform-origin", g1_transform_origin_value);
    			}

    			if (dirty & /*id*/ 1) {
    				attr_dev(svg, "id", /*id*/ ctx[0]);
    			}

    			if (dirty & /*c*/ 256 && svg_class_value !== (svg_class_value = "" + (null_to_empty(/*c*/ ctx[8]) + " svelte-1cj2gr0"))) {
    				attr_dev(svg, "class", svg_class_value);
    			}

    			if (dirty & /*s*/ 512) {
    				attr_dev(svg, "style", /*s*/ ctx[9]);
    			}

    			if (dirty & /*i*/ 128 && svg_viewBox_value !== (svg_viewBox_value = `0 0 ${/*i*/ ctx[7][0]} ${/*i*/ ctx[7][1]}`)) {
    				attr_dev(svg, "viewBox", svg_viewBox_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    			if_block.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$7.name,
    		type: "if",
    		source: "(78:0) {#if i[4]}",
    		ctx
    	});

    	return block;
    }

    // (99:8) {:else}
    function create_else_block$4(ctx) {
    	let path0;
    	let path0_d_value;
    	let path0_fill_value;
    	let path0_fill_opacity_value;
    	let path0_transform_value;
    	let path1;
    	let path1_d_value;
    	let path1_fill_value;
    	let path1_fill_opacity_value;
    	let path1_transform_value;

    	const block = {
    		c: function create() {
    			path0 = svg_element("path");
    			path1 = svg_element("path");
    			this.h();
    		},
    		l: function claim(nodes) {
    			path0 = claim_svg_element(nodes, "path", {
    				d: true,
    				fill: true,
    				"fill-opacity": true,
    				transform: true
    			});

    			children(path0).forEach(detach_dev);

    			path1 = claim_svg_element(nodes, "path", {
    				d: true,
    				fill: true,
    				"fill-opacity": true,
    				transform: true
    			});

    			children(path1).forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(path0, "d", path0_d_value = /*i*/ ctx[7][4][0]);
    			attr_dev(path0, "fill", path0_fill_value = /*secondaryColor*/ ctx[3] || /*color*/ ctx[1] || 'currentColor');

    			attr_dev(path0, "fill-opacity", path0_fill_opacity_value = /*swapOpacity*/ ctx[6] != false
    			? /*primaryOpacity*/ ctx[4]
    			: /*secondaryOpacity*/ ctx[5]);

    			attr_dev(path0, "transform", path0_transform_value = `translate(${/*i*/ ctx[7][0] / -2} ${/*i*/ ctx[7][1] / -2})`);
    			add_location(path0, file$7, 99, 10, 1721);
    			attr_dev(path1, "d", path1_d_value = /*i*/ ctx[7][4][1]);
    			attr_dev(path1, "fill", path1_fill_value = /*primaryColor*/ ctx[2] || /*color*/ ctx[1] || 'currentColor');

    			attr_dev(path1, "fill-opacity", path1_fill_opacity_value = /*swapOpacity*/ ctx[6] != false
    			? /*secondaryOpacity*/ ctx[5]
    			: /*primaryOpacity*/ ctx[4]);

    			attr_dev(path1, "transform", path1_transform_value = `translate(${/*i*/ ctx[7][0] / -2} ${/*i*/ ctx[7][1] / -2})`);
    			add_location(path1, file$7, 105, 10, 1982);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, path0, anchor);
    			insert_hydration_dev(target, path1, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*i*/ 128 && path0_d_value !== (path0_d_value = /*i*/ ctx[7][4][0])) {
    				attr_dev(path0, "d", path0_d_value);
    			}

    			if (dirty & /*secondaryColor, color*/ 10 && path0_fill_value !== (path0_fill_value = /*secondaryColor*/ ctx[3] || /*color*/ ctx[1] || 'currentColor')) {
    				attr_dev(path0, "fill", path0_fill_value);
    			}

    			if (dirty & /*swapOpacity, primaryOpacity, secondaryOpacity*/ 112 && path0_fill_opacity_value !== (path0_fill_opacity_value = /*swapOpacity*/ ctx[6] != false
    			? /*primaryOpacity*/ ctx[4]
    			: /*secondaryOpacity*/ ctx[5])) {
    				attr_dev(path0, "fill-opacity", path0_fill_opacity_value);
    			}

    			if (dirty & /*i*/ 128 && path0_transform_value !== (path0_transform_value = `translate(${/*i*/ ctx[7][0] / -2} ${/*i*/ ctx[7][1] / -2})`)) {
    				attr_dev(path0, "transform", path0_transform_value);
    			}

    			if (dirty & /*i*/ 128 && path1_d_value !== (path1_d_value = /*i*/ ctx[7][4][1])) {
    				attr_dev(path1, "d", path1_d_value);
    			}

    			if (dirty & /*primaryColor, color*/ 6 && path1_fill_value !== (path1_fill_value = /*primaryColor*/ ctx[2] || /*color*/ ctx[1] || 'currentColor')) {
    				attr_dev(path1, "fill", path1_fill_value);
    			}

    			if (dirty & /*swapOpacity, secondaryOpacity, primaryOpacity*/ 112 && path1_fill_opacity_value !== (path1_fill_opacity_value = /*swapOpacity*/ ctx[6] != false
    			? /*secondaryOpacity*/ ctx[5]
    			: /*primaryOpacity*/ ctx[4])) {
    				attr_dev(path1, "fill-opacity", path1_fill_opacity_value);
    			}

    			if (dirty & /*i*/ 128 && path1_transform_value !== (path1_transform_value = `translate(${/*i*/ ctx[7][0] / -2} ${/*i*/ ctx[7][1] / -2})`)) {
    				attr_dev(path1, "transform", path1_transform_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path0);
    			if (detaching) detach_dev(path1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$4.name,
    		type: "else",
    		source: "(99:8) {:else}",
    		ctx
    	});

    	return block;
    }

    // (93:8) {#if typeof i[4] == 'string'}
    function create_if_block_1$2(ctx) {
    	let path;
    	let path_d_value;
    	let path_fill_value;
    	let path_transform_value;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			this.h();
    		},
    		l: function claim(nodes) {
    			path = claim_svg_element(nodes, "path", { d: true, fill: true, transform: true });
    			children(path).forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(path, "d", path_d_value = /*i*/ ctx[7][4]);
    			attr_dev(path, "fill", path_fill_value = /*color*/ ctx[1] || /*primaryColor*/ ctx[2] || 'currentColor');
    			attr_dev(path, "transform", path_transform_value = `translate(${/*i*/ ctx[7][0] / -2} ${/*i*/ ctx[7][1] / -2})`);
    			add_location(path, file$7, 93, 10, 1533);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, path, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*i*/ 128 && path_d_value !== (path_d_value = /*i*/ ctx[7][4])) {
    				attr_dev(path, "d", path_d_value);
    			}

    			if (dirty & /*color, primaryColor*/ 6 && path_fill_value !== (path_fill_value = /*color*/ ctx[1] || /*primaryColor*/ ctx[2] || 'currentColor')) {
    				attr_dev(path, "fill", path_fill_value);
    			}

    			if (dirty & /*i*/ 128 && path_transform_value !== (path_transform_value = `translate(${/*i*/ ctx[7][0] / -2} ${/*i*/ ctx[7][1] / -2})`)) {
    				attr_dev(path, "transform", path_transform_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$2.name,
    		type: "if",
    		source: "(93:8) {#if typeof i[4] == 'string'}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$9(ctx) {
    	let if_block_anchor;
    	let if_block = /*i*/ ctx[7][4] && create_if_block$7(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			if (if_block) if_block.l(nodes);
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_hydration_dev(target, if_block_anchor, anchor);
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*i*/ ctx[7][4]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$7(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$9.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$9($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Fa', slots, []);
    	let { class: clazz = '' } = $$props;
    	let { id = '' } = $$props;
    	let { style = '' } = $$props;
    	let { icon } = $$props;
    	let { size = '' } = $$props;
    	let { color = '' } = $$props;
    	let { fw = false } = $$props;
    	let { pull = '' } = $$props;
    	let { scale = 1 } = $$props;
    	let { translateX = 0 } = $$props;
    	let { translateY = 0 } = $$props;
    	let { rotate = '' } = $$props;
    	let { flip = false } = $$props;
    	let { spin = false } = $$props;
    	let { pulse = false } = $$props;
    	let { primaryColor = '' } = $$props;
    	let { secondaryColor = '' } = $$props;
    	let { primaryOpacity = 1 } = $$props;
    	let { secondaryOpacity = 0.4 } = $$props;
    	let { swapOpacity = false } = $$props;
    	let i;
    	let c;
    	let s;
    	let transform;

    	const writable_props = [
    		'class',
    		'id',
    		'style',
    		'icon',
    		'size',
    		'color',
    		'fw',
    		'pull',
    		'scale',
    		'translateX',
    		'translateY',
    		'rotate',
    		'flip',
    		'spin',
    		'pulse',
    		'primaryColor',
    		'secondaryColor',
    		'primaryOpacity',
    		'secondaryOpacity',
    		'swapOpacity'
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Fa> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('class' in $$props) $$invalidate(11, clazz = $$props.class);
    		if ('id' in $$props) $$invalidate(0, id = $$props.id);
    		if ('style' in $$props) $$invalidate(12, style = $$props.style);
    		if ('icon' in $$props) $$invalidate(13, icon = $$props.icon);
    		if ('size' in $$props) $$invalidate(14, size = $$props.size);
    		if ('color' in $$props) $$invalidate(1, color = $$props.color);
    		if ('fw' in $$props) $$invalidate(15, fw = $$props.fw);
    		if ('pull' in $$props) $$invalidate(16, pull = $$props.pull);
    		if ('scale' in $$props) $$invalidate(17, scale = $$props.scale);
    		if ('translateX' in $$props) $$invalidate(18, translateX = $$props.translateX);
    		if ('translateY' in $$props) $$invalidate(19, translateY = $$props.translateY);
    		if ('rotate' in $$props) $$invalidate(20, rotate = $$props.rotate);
    		if ('flip' in $$props) $$invalidate(21, flip = $$props.flip);
    		if ('spin' in $$props) $$invalidate(22, spin = $$props.spin);
    		if ('pulse' in $$props) $$invalidate(23, pulse = $$props.pulse);
    		if ('primaryColor' in $$props) $$invalidate(2, primaryColor = $$props.primaryColor);
    		if ('secondaryColor' in $$props) $$invalidate(3, secondaryColor = $$props.secondaryColor);
    		if ('primaryOpacity' in $$props) $$invalidate(4, primaryOpacity = $$props.primaryOpacity);
    		if ('secondaryOpacity' in $$props) $$invalidate(5, secondaryOpacity = $$props.secondaryOpacity);
    		if ('swapOpacity' in $$props) $$invalidate(6, swapOpacity = $$props.swapOpacity);
    	};

    	$$self.$capture_state = () => ({
    		joinCss,
    		getStyles,
    		getTransform,
    		clazz,
    		id,
    		style,
    		icon,
    		size,
    		color,
    		fw,
    		pull,
    		scale,
    		translateX,
    		translateY,
    		rotate,
    		flip,
    		spin,
    		pulse,
    		primaryColor,
    		secondaryColor,
    		primaryOpacity,
    		secondaryOpacity,
    		swapOpacity,
    		i,
    		c,
    		s,
    		transform
    	});

    	$$self.$inject_state = $$props => {
    		if ('clazz' in $$props) $$invalidate(11, clazz = $$props.clazz);
    		if ('id' in $$props) $$invalidate(0, id = $$props.id);
    		if ('style' in $$props) $$invalidate(12, style = $$props.style);
    		if ('icon' in $$props) $$invalidate(13, icon = $$props.icon);
    		if ('size' in $$props) $$invalidate(14, size = $$props.size);
    		if ('color' in $$props) $$invalidate(1, color = $$props.color);
    		if ('fw' in $$props) $$invalidate(15, fw = $$props.fw);
    		if ('pull' in $$props) $$invalidate(16, pull = $$props.pull);
    		if ('scale' in $$props) $$invalidate(17, scale = $$props.scale);
    		if ('translateX' in $$props) $$invalidate(18, translateX = $$props.translateX);
    		if ('translateY' in $$props) $$invalidate(19, translateY = $$props.translateY);
    		if ('rotate' in $$props) $$invalidate(20, rotate = $$props.rotate);
    		if ('flip' in $$props) $$invalidate(21, flip = $$props.flip);
    		if ('spin' in $$props) $$invalidate(22, spin = $$props.spin);
    		if ('pulse' in $$props) $$invalidate(23, pulse = $$props.pulse);
    		if ('primaryColor' in $$props) $$invalidate(2, primaryColor = $$props.primaryColor);
    		if ('secondaryColor' in $$props) $$invalidate(3, secondaryColor = $$props.secondaryColor);
    		if ('primaryOpacity' in $$props) $$invalidate(4, primaryOpacity = $$props.primaryOpacity);
    		if ('secondaryOpacity' in $$props) $$invalidate(5, secondaryOpacity = $$props.secondaryOpacity);
    		if ('swapOpacity' in $$props) $$invalidate(6, swapOpacity = $$props.swapOpacity);
    		if ('i' in $$props) $$invalidate(7, i = $$props.i);
    		if ('c' in $$props) $$invalidate(8, c = $$props.c);
    		if ('s' in $$props) $$invalidate(9, s = $$props.s);
    		if ('transform' in $$props) $$invalidate(10, transform = $$props.transform);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*icon*/ 8192) {
    			$$invalidate(7, i = icon && icon.icon || [0, 0, '', [], '']);
    		}

    		if ($$self.$$.dirty & /*clazz, spin, pulse*/ 12584960) {
    			$$invalidate(8, c = joinCss([clazz, 'svelte-fa', spin && 'spin', pulse && 'pulse'], ' '));
    		}

    		if ($$self.$$.dirty & /*style, size, pull, fw*/ 118784) {
    			$$invalidate(9, s = getStyles(style, size, pull, fw));
    		}

    		if ($$self.$$.dirty & /*scale, translateX, translateY, rotate, flip*/ 4063232) {
    			$$invalidate(10, transform = getTransform(scale, translateX, translateY, rotate, flip, 512));
    		}
    	};

    	return [
    		id,
    		color,
    		primaryColor,
    		secondaryColor,
    		primaryOpacity,
    		secondaryOpacity,
    		swapOpacity,
    		i,
    		c,
    		s,
    		transform,
    		clazz,
    		style,
    		icon,
    		size,
    		fw,
    		pull,
    		scale,
    		translateX,
    		translateY,
    		rotate,
    		flip,
    		spin,
    		pulse
    	];
    }

    class Fa extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$9, create_fragment$9, safe_not_equal, {
    			class: 11,
    			id: 0,
    			style: 12,
    			icon: 13,
    			size: 14,
    			color: 1,
    			fw: 15,
    			pull: 16,
    			scale: 17,
    			translateX: 18,
    			translateY: 19,
    			rotate: 20,
    			flip: 21,
    			spin: 22,
    			pulse: 23,
    			primaryColor: 2,
    			secondaryColor: 3,
    			primaryOpacity: 4,
    			secondaryOpacity: 5,
    			swapOpacity: 6
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Fa",
    			options,
    			id: create_fragment$9.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*icon*/ ctx[13] === undefined && !('icon' in props)) {
    			console.warn("<Fa> was created without expected prop 'icon'");
    		}
    	}

    	get class() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set class(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get id() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set id(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get style() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set style(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get icon() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set icon(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get size() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set size(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get color() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get fw() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set fw(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get pull() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set pull(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get scale() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set scale(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get translateX() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set translateX(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get translateY() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set translateY(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get rotate() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set rotate(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get flip() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set flip(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get spin() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set spin(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get pulse() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set pulse(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get primaryColor() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set primaryColor(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get secondaryColor() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set secondaryColor(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get primaryOpacity() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set primaryOpacity(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get secondaryOpacity() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set secondaryOpacity(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get swapOpacity() {
    		throw new Error("<Fa>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set swapOpacity(value) {
    		throw new Error("<Fa>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /*!
     * Font Awesome Free 5.15.4 by @fontawesome - https://fontawesome.com
     * License - https://fontawesome.com/license/free (Icons: CC BY 4.0, Fonts: SIL OFL 1.1, Code: MIT License)
     */
    var faArrowAltCircleLeft = {
      prefix: 'fas',
      iconName: 'arrow-alt-circle-left',
      icon: [512, 512, [], "f359", "M256 504C119 504 8 393 8 256S119 8 256 8s248 111 248 248-111 248-248 248zm116-292H256v-70.9c0-10.7-13-16.1-20.5-8.5L121.2 247.5c-4.7 4.7-4.7 12.2 0 16.9l114.3 114.9c7.6 7.6 20.5 2.2 20.5-8.5V300h116c6.6 0 12-5.4 12-12v-64c0-6.6-5.4-12-12-12z"]
    };
    var faClone = {
      prefix: 'fas',
      iconName: 'clone',
      icon: [512, 512, [], "f24d", "M464 0c26.51 0 48 21.49 48 48v288c0 26.51-21.49 48-48 48H176c-26.51 0-48-21.49-48-48V48c0-26.51 21.49-48 48-48h288M176 416c-44.112 0-80-35.888-80-80V128H48c-26.51 0-48 21.49-48 48v288c0 26.51 21.49 48 48 48h288c26.51 0 48-21.49 48-48v-48H176z"]
    };
    var faCogs = {
      prefix: 'fas',
      iconName: 'cogs',
      icon: [640, 512, [], "f085", "M512.1 191l-8.2 14.3c-3 5.3-9.4 7.5-15.1 5.4-11.8-4.4-22.6-10.7-32.1-18.6-4.6-3.8-5.8-10.5-2.8-15.7l8.2-14.3c-6.9-8-12.3-17.3-15.9-27.4h-16.5c-6 0-11.2-4.3-12.2-10.3-2-12-2.1-24.6 0-37.1 1-6 6.2-10.4 12.2-10.4h16.5c3.6-10.1 9-19.4 15.9-27.4l-8.2-14.3c-3-5.2-1.9-11.9 2.8-15.7 9.5-7.9 20.4-14.2 32.1-18.6 5.7-2.1 12.1.1 15.1 5.4l8.2 14.3c10.5-1.9 21.2-1.9 31.7 0L552 6.3c3-5.3 9.4-7.5 15.1-5.4 11.8 4.4 22.6 10.7 32.1 18.6 4.6 3.8 5.8 10.5 2.8 15.7l-8.2 14.3c6.9 8 12.3 17.3 15.9 27.4h16.5c6 0 11.2 4.3 12.2 10.3 2 12 2.1 24.6 0 37.1-1 6-6.2 10.4-12.2 10.4h-16.5c-3.6 10.1-9 19.4-15.9 27.4l8.2 14.3c3 5.2 1.9 11.9-2.8 15.7-9.5 7.9-20.4 14.2-32.1 18.6-5.7 2.1-12.1-.1-15.1-5.4l-8.2-14.3c-10.4 1.9-21.2 1.9-31.7 0zm-10.5-58.8c38.5 29.6 82.4-14.3 52.8-52.8-38.5-29.7-82.4 14.3-52.8 52.8zM386.3 286.1l33.7 16.8c10.1 5.8 14.5 18.1 10.5 29.1-8.9 24.2-26.4 46.4-42.6 65.8-7.4 8.9-20.2 11.1-30.3 5.3l-29.1-16.8c-16 13.7-34.6 24.6-54.9 31.7v33.6c0 11.6-8.3 21.6-19.7 23.6-24.6 4.2-50.4 4.4-75.9 0-11.5-2-20-11.9-20-23.6V418c-20.3-7.2-38.9-18-54.9-31.7L74 403c-10 5.8-22.9 3.6-30.3-5.3-16.2-19.4-33.3-41.6-42.2-65.7-4-10.9.4-23.2 10.5-29.1l33.3-16.8c-3.9-20.9-3.9-42.4 0-63.4L12 205.8c-10.1-5.8-14.6-18.1-10.5-29 8.9-24.2 26-46.4 42.2-65.8 7.4-8.9 20.2-11.1 30.3-5.3l29.1 16.8c16-13.7 34.6-24.6 54.9-31.7V57.1c0-11.5 8.2-21.5 19.6-23.5 24.6-4.2 50.5-4.4 76-.1 11.5 2 20 11.9 20 23.6v33.6c20.3 7.2 38.9 18 54.9 31.7l29.1-16.8c10-5.8 22.9-3.6 30.3 5.3 16.2 19.4 33.2 41.6 42.1 65.8 4 10.9.1 23.2-10 29.1l-33.7 16.8c3.9 21 3.9 42.5 0 63.5zm-117.6 21.1c59.2-77-28.7-164.9-105.7-105.7-59.2 77 28.7 164.9 105.7 105.7zm243.4 182.7l-8.2 14.3c-3 5.3-9.4 7.5-15.1 5.4-11.8-4.4-22.6-10.7-32.1-18.6-4.6-3.8-5.8-10.5-2.8-15.7l8.2-14.3c-6.9-8-12.3-17.3-15.9-27.4h-16.5c-6 0-11.2-4.3-12.2-10.3-2-12-2.1-24.6 0-37.1 1-6 6.2-10.4 12.2-10.4h16.5c3.6-10.1 9-19.4 15.9-27.4l-8.2-14.3c-3-5.2-1.9-11.9 2.8-15.7 9.5-7.9 20.4-14.2 32.1-18.6 5.7-2.1 12.1.1 15.1 5.4l8.2 14.3c10.5-1.9 21.2-1.9 31.7 0l8.2-14.3c3-5.3 9.4-7.5 15.1-5.4 11.8 4.4 22.6 10.7 32.1 18.6 4.6 3.8 5.8 10.5 2.8 15.7l-8.2 14.3c6.9 8 12.3 17.3 15.9 27.4h16.5c6 0 11.2 4.3 12.2 10.3 2 12 2.1 24.6 0 37.1-1 6-6.2 10.4-12.2 10.4h-16.5c-3.6 10.1-9 19.4-15.9 27.4l8.2 14.3c3 5.2 1.9 11.9-2.8 15.7-9.5 7.9-20.4 14.2-32.1 18.6-5.7 2.1-12.1-.1-15.1-5.4l-8.2-14.3c-10.4 1.9-21.2 1.9-31.7 0zM501.6 431c38.5 29.6 82.4-14.3 52.8-52.8-38.5-29.6-82.4 14.3-52.8 52.8z"]
    };
    var faPhotoVideo = {
      prefix: 'fas',
      iconName: 'photo-video',
      icon: [640, 512, [], "f87c", "M608 0H160a32 32 0 0 0-32 32v96h160V64h192v320h128a32 32 0 0 0 32-32V32a32 32 0 0 0-32-32zM232 103a9 9 0 0 1-9 9h-30a9 9 0 0 1-9-9V73a9 9 0 0 1 9-9h30a9 9 0 0 1 9 9zm352 208a9 9 0 0 1-9 9h-30a9 9 0 0 1-9-9v-30a9 9 0 0 1 9-9h30a9 9 0 0 1 9 9zm0-104a9 9 0 0 1-9 9h-30a9 9 0 0 1-9-9v-30a9 9 0 0 1 9-9h30a9 9 0 0 1 9 9zm0-104a9 9 0 0 1-9 9h-30a9 9 0 0 1-9-9V73a9 9 0 0 1 9-9h30a9 9 0 0 1 9 9zm-168 57H32a32 32 0 0 0-32 32v288a32 32 0 0 0 32 32h384a32 32 0 0 0 32-32V192a32 32 0 0 0-32-32zM96 224a32 32 0 1 1-32 32 32 32 0 0 1 32-32zm288 224H64v-32l64-64 32 32 128-128 96 96z"]
    };
    var faPlus = {
      prefix: 'fas',
      iconName: 'plus',
      icon: [448, 512, [], "f067", "M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"]
    };
    var faStickyNote = {
      prefix: 'fas',
      iconName: 'sticky-note',
      icon: [448, 512, [], "f249", "M312 320h136V56c0-13.3-10.7-24-24-24H24C10.7 32 0 42.7 0 56v400c0 13.3 10.7 24 24 24h264V344c0-13.2 10.8-24 24-24zm129 55l-98 98c-4.5 4.5-10.6 7-17 7h-6V352h128v6.1c0 6.3-2.5 12.4-7 16.9z"]
    };
    var faUserPlus = {
      prefix: 'fas',
      iconName: 'user-plus',
      icon: [640, 512, [], "f234", "M624 208h-64v-64c0-8.8-7.2-16-16-16h-32c-8.8 0-16 7.2-16 16v64h-64c-8.8 0-16 7.2-16 16v32c0 8.8 7.2 16 16 16h64v64c0 8.8 7.2 16 16 16h32c8.8 0 16-7.2 16-16v-64h64c8.8 0 16-7.2 16-16v-32c0-8.8-7.2-16-16-16zm-400 48c70.7 0 128-57.3 128-128S294.7 0 224 0 96 57.3 96 128s57.3 128 128 128zm89.6 32h-16.7c-22.2 10.2-46.9 16-72.9 16s-50.6-5.8-72.9-16h-16.7C60.2 288 0 348.2 0 422.4V464c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48v-41.6c0-74.2-60.2-134.4-134.4-134.4z"]
    };

    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }

    function fly(node, { delay = 0, duration = 400, easing = cubicOut, x = 0, y = 0, opacity = 0 } = {}) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (t, u) => `
			transform: ${transform} translate(${(1 - t) * x}px, ${(1 - t) * y}px);
			opacity: ${target_opacity - (od * u)}`
        };
    }

    /* src\components\Sidebar.svelte generated by Svelte v3.44.2 */
    const file$6 = "src\\components\\Sidebar.svelte";

    // (1:0) {#if show}
    function create_if_block$6(ctx) {
    	let div1;
    	let header;
    	let h2;
    	let fa0;
    	let t0;
    	let t1;
    	let div0;
    	let button0;
    	let fa1;
    	let t2;
    	let span0;
    	let t3;
    	let t4;
    	let button1;
    	let fa2;
    	let t5;
    	let span1;
    	let t6;
    	let t7;
    	let button2;
    	let fa3;
    	let t8;
    	let span2;
    	let t9;
    	let div1_transition;
    	let current;
    	let mounted;
    	let dispose;

    	fa0 = new Fa({
    			props: { icon: faCogs, size: "sm" },
    			$$inline: true
    		});

    	fa1 = new Fa({
    			props: { icon: faStickyNote, size: "sm" },
    			$$inline: true
    		});

    	fa2 = new Fa({
    			props: { icon: faPhotoVideo, size: "sm" },
    			$$inline: true
    		});

    	fa3 = new Fa({
    			props: { icon: faUserPlus, size: "sm" },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			header = element("header");
    			h2 = element("h2");
    			create_component(fa0.$$.fragment);
    			t0 = text("\r\n      Actions");
    			t1 = space();
    			div0 = element("div");
    			button0 = element("button");
    			create_component(fa1.$$.fragment);
    			t2 = space();
    			span0 = element("span");
    			t3 = text("Ajouter note");
    			t4 = space();
    			button1 = element("button");
    			create_component(fa2.$$.fragment);
    			t5 = space();
    			span1 = element("span");
    			t6 = text("Ajouter media");
    			t7 = space();
    			button2 = element("button");
    			create_component(fa3.$$.fragment);
    			t8 = space();
    			span2 = element("span");
    			t9 = text("Ajouter contributeur");
    			this.h();
    		},
    		l: function claim(nodes) {
    			div1 = claim_element(nodes, "DIV", { class: true });
    			var div1_nodes = children(div1);
    			header = claim_element(div1_nodes, "HEADER", { class: true });
    			var header_nodes = children(header);
    			h2 = claim_element(header_nodes, "H2", {});
    			var h2_nodes = children(h2);
    			claim_component(fa0.$$.fragment, h2_nodes);
    			t0 = claim_text(h2_nodes, "\r\n      Actions");
    			h2_nodes.forEach(detach_dev);
    			header_nodes.forEach(detach_dev);
    			t1 = claim_space(div1_nodes);
    			div0 = claim_element(div1_nodes, "DIV", { class: true });
    			var div0_nodes = children(div0);
    			button0 = claim_element(div0_nodes, "BUTTON", { class: true });
    			var button0_nodes = children(button0);
    			claim_component(fa1.$$.fragment, button0_nodes);
    			t2 = claim_space(button0_nodes);
    			span0 = claim_element(button0_nodes, "SPAN", { class: true });
    			var span0_nodes = children(span0);
    			t3 = claim_text(span0_nodes, "Ajouter note");
    			span0_nodes.forEach(detach_dev);
    			button0_nodes.forEach(detach_dev);
    			t4 = claim_space(div0_nodes);
    			button1 = claim_element(div0_nodes, "BUTTON", { class: true });
    			var button1_nodes = children(button1);
    			claim_component(fa2.$$.fragment, button1_nodes);
    			t5 = claim_space(button1_nodes);
    			span1 = claim_element(button1_nodes, "SPAN", { class: true });
    			var span1_nodes = children(span1);
    			t6 = claim_text(span1_nodes, "Ajouter media");
    			span1_nodes.forEach(detach_dev);
    			button1_nodes.forEach(detach_dev);
    			t7 = claim_space(div0_nodes);
    			button2 = claim_element(div0_nodes, "BUTTON", { class: true });
    			var button2_nodes = children(button2);
    			claim_component(fa3.$$.fragment, button2_nodes);
    			t8 = claim_space(button2_nodes);
    			span2 = claim_element(button2_nodes, "SPAN", { class: true });
    			var span2_nodes = children(span2);
    			t9 = claim_text(span2_nodes, "Ajouter contributeur");
    			span2_nodes.forEach(detach_dev);
    			button2_nodes.forEach(detach_dev);
    			div0_nodes.forEach(detach_dev);
    			div1_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			add_location(h2, file$6, 3, 4, 89);
    			attr_dev(header, "class", "svelte-mz432w");
    			add_location(header, file$6, 2, 2, 75);
    			attr_dev(span0, "class", "svelte-mz432w");
    			add_location(span0, file$6, 11, 6, 277);
    			attr_dev(button0, "class", "svelte-mz432w");
    			add_location(button0, file$6, 9, 4, 203);
    			attr_dev(span1, "class", "svelte-mz432w");
    			add_location(span1, file$6, 15, 6, 382);
    			attr_dev(button1, "class", "svelte-mz432w");
    			add_location(button1, file$6, 13, 4, 323);
    			attr_dev(span2, "class", "svelte-mz432w");
    			add_location(span2, file$6, 19, 6, 486);
    			attr_dev(button2, "class", "svelte-mz432w");
    			add_location(button2, file$6, 17, 4, 429);
    			attr_dev(div0, "class", "container svelte-mz432w");
    			add_location(div0, file$6, 8, 2, 174);
    			attr_dev(div1, "class", "sidebar svelte-mz432w");
    			add_location(div1, file$6, 1, 0, 12);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, div1, anchor);
    			append_hydration_dev(div1, header);
    			append_hydration_dev(header, h2);
    			mount_component(fa0, h2, null);
    			append_hydration_dev(h2, t0);
    			append_hydration_dev(div1, t1);
    			append_hydration_dev(div1, div0);
    			append_hydration_dev(div0, button0);
    			mount_component(fa1, button0, null);
    			append_hydration_dev(button0, t2);
    			append_hydration_dev(button0, span0);
    			append_hydration_dev(span0, t3);
    			append_hydration_dev(div0, t4);
    			append_hydration_dev(div0, button1);
    			mount_component(fa2, button1, null);
    			append_hydration_dev(button1, t5);
    			append_hydration_dev(button1, span1);
    			append_hydration_dev(span1, t6);
    			append_hydration_dev(div0, t7);
    			append_hydration_dev(div0, button2);
    			mount_component(fa3, button2, null);
    			append_hydration_dev(button2, t8);
    			append_hydration_dev(button2, span2);
    			append_hydration_dev(span2, t9);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(button0, "click", /*add*/ ctx[1], false, false, false);
    				mounted = true;
    			}
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(fa0.$$.fragment, local);
    			transition_in(fa1.$$.fragment, local);
    			transition_in(fa2.$$.fragment, local);
    			transition_in(fa3.$$.fragment, local);

    			add_render_callback(() => {
    				if (!div1_transition) div1_transition = create_bidirectional_transition(div1, fly, { x: 250, opacity: 1 }, true);
    				div1_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(fa0.$$.fragment, local);
    			transition_out(fa1.$$.fragment, local);
    			transition_out(fa2.$$.fragment, local);
    			transition_out(fa3.$$.fragment, local);
    			if (!div1_transition) div1_transition = create_bidirectional_transition(div1, fly, { x: 250, opacity: 1 }, false);
    			div1_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			destroy_component(fa0);
    			destroy_component(fa1);
    			destroy_component(fa2);
    			destroy_component(fa3);
    			if (detaching && div1_transition) div1_transition.end();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$6.name,
    		type: "if",
    		source: "(1:0) {#if show}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$8(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*show*/ ctx[0] && create_if_block$6(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			if (if_block) if_block.l(nodes);
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_hydration_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*show*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*show*/ 1) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$6(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$8.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$8($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Sidebar', slots, []);
    	const dispatch = createEventDispatcher();

    	function add() {
    		dispatch('create');
    	}

    	let { show = false } = $$props;
    	const writable_props = ['show'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Sidebar> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('show' in $$props) $$invalidate(0, show = $$props.show);
    	};

    	$$self.$capture_state = () => ({
    		fly,
    		Fa,
    		faCogs,
    		faStickyNote,
    		faPhotoVideo,
    		faUserPlus,
    		createEventDispatcher,
    		dispatch,
    		add,
    		show
    	});

    	$$self.$inject_state = $$props => {
    		if ('show' in $$props) $$invalidate(0, show = $$props.show);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [show, add];
    }

    class Sidebar extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$8, create_fragment$8, safe_not_equal, { show: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Sidebar",
    			options,
    			id: create_fragment$8.name
    		});
    	}

    	get show() {
    		throw new Error("<Sidebar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set show(value) {
    		throw new Error("<Sidebar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    // src/memoize.js
    function memoize(fn, options) {
      var cache = options && options.cache ? options.cache : cacheDefault;
      var serializer = options && options.serializer ? options.serializer : serializerDefault;
      var strategy = options && options.strategy ? options.strategy : strategyDefault;
      return strategy(fn, {
        cache,
        serializer
      });
    }
    function isPrimitive(value) {
      return value == null || typeof value === "number" || typeof value === "boolean";
    }
    function monadic(fn, cache, serializer, arg) {
      var cacheKey = isPrimitive(arg) ? arg : serializer(arg);
      var computedValue = cache.get(cacheKey);
      if (typeof computedValue === "undefined") {
        computedValue = fn.call(this, arg);
        cache.set(cacheKey, computedValue);
      }
      return computedValue;
    }
    function variadic(fn, cache, serializer) {
      var args = Array.prototype.slice.call(arguments, 3);
      var cacheKey = serializer(args);
      var computedValue = cache.get(cacheKey);
      if (typeof computedValue === "undefined") {
        computedValue = fn.apply(this, args);
        cache.set(cacheKey, computedValue);
      }
      return computedValue;
    }
    function assemble(fn, context, strategy, cache, serialize) {
      return strategy.bind(context, fn, cache, serialize);
    }
    function strategyDefault(fn, options) {
      var strategy = fn.length === 1 ? monadic : variadic;
      return assemble(fn, this, strategy, options.cache.create(), options.serializer);
    }
    function serializerDefault() {
      return JSON.stringify(arguments);
    }
    function ObjectWithoutPrototypeCache() {
      this.cache = Object.create(null);
    }
    ObjectWithoutPrototypeCache.prototype.has = function(key) {
      return key in this.cache;
    };
    ObjectWithoutPrototypeCache.prototype.get = function(key) {
      return this.cache[key];
    };
    ObjectWithoutPrototypeCache.prototype.set = function(key, value) {
      this.cache[key] = value;
    };
    var cacheDefault = {
      create: function create() {
        return new ObjectWithoutPrototypeCache();
      }
    };
    var memoize_default = memoize;

    // src/index.ts
    var DEFAULT_CLASS = {
      MAIN: "svelte-draggable",
      DRAGGING: "svelte-draggable-dragging",
      DRAGGED: "svelte-draggable-dragged"
    };
    var draggable = (node, options = {}) => {
      let {
        bounds,
        axis = "both",
        gpuAcceleration = true,
        applyUserSelectHack = true,
        disabled = false,
        grid,
        position,
        cancel,
        handle,
        defaultClass = DEFAULT_CLASS.MAIN,
        defaultClassDragging = DEFAULT_CLASS.DRAGGING,
        defaultClassDragged = DEFAULT_CLASS.DRAGGED,
        defaultPosition = { x: 0, y: 0 },
        onDragStart,
        onDrag,
        onDragEnd
      } = options;
      let active = false;
      let [translateX, translateY] = [0, 0];
      let [initialX, initialY] = [0, 0];
      let [clientToNodeOffsetX, clientToNodeOffsetY] = [0, 0];
      let [xOffset, yOffset] = [defaultPosition.x, defaultPosition.y];
      setTranslate(xOffset, yOffset, node, gpuAcceleration);
      let canMoveInX;
      let canMoveInY;
      let bodyOriginalUserSelectVal = "";
      let computedBounds;
      let nodeRect;
      let dragEl;
      let cancelEl;
      let isControlled = !!position;
      function fireSvelteDragStartEvent(node2) {
        const data = { offsetX: translateX, offsetY: translateY };
        node2.dispatchEvent(new CustomEvent("svelte-drag:start", { detail: data }));
        onDragStart == null ? void 0 : onDragStart(data);
      }
      function fireSvelteDragStopEvent(node2) {
        const data = { offsetX: translateX, offsetY: translateY };
        node2.dispatchEvent(new CustomEvent("svelte-drag:end", { detail: data }));
        onDragEnd == null ? void 0 : onDragEnd(data);
      }
      function fireSvelteDragEvent(node2, translateX2, translateY2) {
        const data = { offsetX: translateX2, offsetY: translateY2 };
        node2.dispatchEvent(new CustomEvent("svelte-drag", { detail: data }));
        onDrag == null ? void 0 : onDrag(data);
      }
      const listen = addEventListener;
      listen("touchstart", dragStart, false);
      listen("touchend", dragEnd, false);
      listen("touchmove", drag, false);
      listen("mousedown", dragStart, false);
      listen("mouseup", dragEnd, false);
      listen("mousemove", drag, false);
      node.style.touchAction = "none";
      const calculateInverseScale = () => {
        let inverseScale = node.offsetWidth / nodeRect.width;
        if (isNaN(inverseScale))
          inverseScale = 1;
        return inverseScale;
      };
      function dragStart(e) {
        if (disabled)
          return;
        node.classList.add(defaultClass);
        dragEl = getDragEl(handle, node);
        cancelEl = getCancelElement(cancel, node);
        canMoveInX = ["both", "x"].includes(axis);
        canMoveInY = ["both", "y"].includes(axis);
        if (typeof bounds !== "undefined")
          computedBounds = computeBoundRect(bounds, node);
        nodeRect = node.getBoundingClientRect();
        if (isString(handle) && isString(cancel) && handle === cancel)
          throw new Error("`handle` selector can't be same as `cancel` selector");
        if (cancelEl == null ? void 0 : cancelEl.contains(dragEl))
          throw new Error("Element being dragged can't be a child of the element on which `cancel` is applied");
        if (dragEl.contains(e.target) && !(cancelEl == null ? void 0 : cancelEl.contains(e.target)))
          active = true;
        if (!active)
          return;
        if (applyUserSelectHack) {
          bodyOriginalUserSelectVal = document.body.style.userSelect;
          document.body.style.userSelect = "none";
        }
        fireSvelteDragStartEvent(node);
        const { clientX, clientY } = isTouchEvent(e) ? e.touches[0] : e;
        const inverseScale = calculateInverseScale();
        if (canMoveInX)
          initialX = clientX - xOffset / inverseScale;
        if (canMoveInY)
          initialY = clientY - yOffset / inverseScale;
        if (computedBounds) {
          clientToNodeOffsetX = clientX - nodeRect.left;
          clientToNodeOffsetY = clientY - nodeRect.top;
        }
      }
      function dragEnd(e) {
        if (disabled)
          return;
        if (!active)
          return;
        node.classList.remove(defaultClassDragging);
        node.classList.add(defaultClassDragged);
        if (applyUserSelectHack)
          document.body.style.userSelect = bodyOriginalUserSelectVal;
        fireSvelteDragStopEvent(node);
        if (canMoveInX)
          initialX = translateX;
        if (canMoveInX)
          initialY = translateY;
        active = false;
      }
      function drag(e) {
        if (!active)
          return;
        node.classList.add(defaultClassDragging);
        e.preventDefault();
        nodeRect = node.getBoundingClientRect();
        const { clientX, clientY } = isTouchEvent(e) ? e.touches[0] : e;
        let [finalX, finalY] = [clientX, clientY];
        const inverseScale = calculateInverseScale();
        if (computedBounds) {
          const virtualClientBounds = {
            left: computedBounds.left + clientToNodeOffsetX,
            top: computedBounds.top + clientToNodeOffsetY,
            right: computedBounds.right + clientToNodeOffsetX - nodeRect.width,
            bottom: computedBounds.bottom + clientToNodeOffsetY - nodeRect.height
          };
          finalX = Math.min(Math.max(finalX, virtualClientBounds.left), virtualClientBounds.right);
          finalY = Math.min(Math.max(finalY, virtualClientBounds.top), virtualClientBounds.bottom);
        }
        if (Array.isArray(grid)) {
          let [xSnap, ySnap] = grid;
          if (isNaN(+xSnap) || xSnap < 0)
            throw new Error("1st argument of `grid` must be a valid positive number");
          if (isNaN(+ySnap) || ySnap < 0)
            throw new Error("2nd argument of `grid` must be a valid positive number");
          let [deltaX, deltaY] = [finalX - initialX, finalY - initialY];
          [deltaX, deltaY] = snapToGrid([Math.floor(xSnap / inverseScale), Math.floor(ySnap / inverseScale)], deltaX, deltaY);
          if (!deltaX && !deltaY)
            return;
          [finalX, finalY] = [initialX + deltaX, initialY + deltaY];
        }
        if (canMoveInX)
          translateX = (finalX - initialX) * inverseScale;
        if (canMoveInY)
          translateY = (finalY - initialY) * inverseScale;
        [xOffset, yOffset] = [translateX, translateY];
        fireSvelteDragEvent(node, translateX, translateY);
        Promise.resolve().then(() => setTranslate(translateX, translateY, node, gpuAcceleration));
      }
      return {
        destroy: () => {
          const unlisten = removeEventListener;
          unlisten("touchstart", dragStart, false);
          unlisten("touchend", dragEnd, false);
          unlisten("touchmove", drag, false);
          unlisten("mousedown", dragStart, false);
          unlisten("mouseup", dragEnd, false);
          unlisten("mousemove", drag, false);
        },
        update: (options2) => {
          var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
          axis = options2.axis || "both";
          disabled = (_a = options2.disabled) != null ? _a : false;
          handle = options2.handle;
          bounds = options2.bounds;
          cancel = options2.cancel;
          applyUserSelectHack = (_b = options2.applyUserSelectHack) != null ? _b : true;
          grid = options2.grid;
          gpuAcceleration = (_c = options2.gpuAcceleration) != null ? _c : true;
          const dragged = node.classList.contains(defaultClassDragged);
          node.classList.remove(defaultClass, defaultClassDragged);
          defaultClass = (_d = options2.defaultClass) != null ? _d : DEFAULT_CLASS.MAIN;
          defaultClassDragging = (_e = options2.defaultClassDragging) != null ? _e : DEFAULT_CLASS.DRAGGING;
          defaultClassDragged = (_f = options2.defaultClassDragged) != null ? _f : DEFAULT_CLASS.DRAGGED;
          node.classList.add(defaultClass);
          if (dragged)
            node.classList.add(defaultClassDragged);
          if (isControlled) {
            xOffset = translateX = (_h = (_g = options2.position) == null ? void 0 : _g.x) != null ? _h : translateX;
            yOffset = translateY = (_j = (_i = options2.position) == null ? void 0 : _i.y) != null ? _j : translateY;
            Promise.resolve().then(() => setTranslate(translateX, translateY, node, gpuAcceleration));
          }
        }
      };
    };
    function isTouchEvent(event) {
      return Boolean(event.touches && event.touches.length);
    }
    function isString(val) {
      return typeof val === "string";
    }
    var snapToGrid = memoize_default(([xSnap, ySnap], pendingX, pendingY) => {
      const x = Math.round(pendingX / xSnap) * xSnap;
      const y = Math.round(pendingY / ySnap) * ySnap;
      return [x, y];
    });
    function getDragEl(handle, node) {
      if (!handle)
        return node;
      const handleEl = node.querySelector(handle);
      if (handleEl === null)
        throw new Error("Selector passed for `handle` option should be child of the element on which the action is applied");
      return handleEl;
    }
    function getCancelElement(cancel, node) {
      if (!cancel)
        return;
      const cancelEl = node.querySelector(cancel);
      if (cancelEl === null)
        throw new Error("Selector passed for `cancel` option should be child of the element on which the action is applied");
      return cancelEl;
    }
    function computeBoundRect(bounds, rootNode) {
      if (typeof bounds === "object") {
        const [windowWidth, windowHeight] = [window.innerWidth, window.innerHeight];
        const { top = 0, left = 0, right = 0, bottom = 0 } = bounds;
        const computedRight = windowWidth - right;
        const computedBottom = windowHeight - bottom;
        return { top, right: computedRight, bottom: computedBottom, left };
      }
      if (bounds === "parent")
        return rootNode.parentNode.getBoundingClientRect();
      const node = document.querySelector(bounds);
      if (node === null)
        throw new Error("The selector provided for bound doesn't exists in the document.");
      const computedBounds = node.getBoundingClientRect();
      return computedBounds;
    }
    function setTranslate(xPos, yPos, el, gpuAcceleration) {
      el.style.transform = gpuAcceleration ? `translate3d(${+xPos}px, ${+yPos}px, 0)` : `translate(${+xPos}px, ${+yPos}px)`;
    }

    const subscriber_queue = [];
    /**
     * Creates a `Readable` store that allows reading by subscription.
     * @param value initial value
     * @param {StartStopNotifier}start start and stop notifications for subscriptions
     */
    function readable(value, start) {
        return {
            subscribe: writable(value, start).subscribe
        };
    }
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = new Set();
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (const subscriber of subscribers) {
                        subscriber[1]();
                        subscriber_queue.push(subscriber, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.add(subscriber);
            if (subscribers.size === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                subscribers.delete(subscriber);
                if (subscribers.size === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }
    function derived(stores, fn, initial_value) {
        const single = !Array.isArray(stores);
        const stores_array = single
            ? [stores]
            : stores;
        const auto = fn.length < 2;
        return readable(initial_value, (set) => {
            let inited = false;
            const values = [];
            let pending = 0;
            let cleanup = noop;
            const sync = () => {
                if (pending) {
                    return;
                }
                cleanup();
                const result = fn(single ? values[0] : values, set);
                if (auto) {
                    set(result);
                }
                else {
                    cleanup = is_function(result) ? result : noop;
                }
            };
            const unsubscribers = stores_array.map((store, i) => subscribe(store, (value) => {
                values[i] = value;
                pending &= ~(1 << i);
                if (inited) {
                    sync();
                }
            }, () => {
                pending |= (1 << i);
            }));
            inited = true;
            sync();
            return function stop() {
                run_all(unsubscribers);
                cleanup();
            };
        });
    }

    var wsStore = writable(new WebSocket('ws://localhost:9000/ws'));

    var toast = writable(undefined);

    const store = writable(undefined);

    let roomId;
    let socket;

    // server to client

    store.subscribe(room => roomId = room?.id);
    wsStore.subscribe((ws) => {
      socket = ws;
      socket.onmessage = (e) => {
        const message = JSON.parse(e.data);
        console.debug("new message : ", message);

        switch (message.event) {
          // Room related event
          case "enter_room":
            store.set({ id: message.room, cards: message.cards });
            break;

          // Cards related event
          case "created_card":
            store.update(room => {
              return { id: room.id, cards: [...room.cards, message.card] };
            });
            break;
          case "deleted_card":
            store.update(room => {
              return {
                id: room.id,
                cards: room.cards.filter(card => card.id !== message.id)
              };
            });
            break;
          case "modified_card":
            store.update(room => {
              if (room && room.cards)
                return {
                  id: room.id,
                  cards: room.cards.map((card) =>
                    (card.id === message.card.id) ? message.card : card)
                };
              else return room;
            });
            break;

          // Other
          case "resync":
            console.log("TODO, resync client cards");
            break;
          case "notification":
            toast.set(message.text);
            break;
        }
      };

      socket.onerror = () => {
        toast.set(`Connection lost, attempting to reconnect`);
        console.warn(`Connection lost, entering in room n°${roomId}...`);
        wsStore.set(new WebSocket('ws://localhost:9000/ws'));
        joinRoom(roomId);
      };
    });

    // Client to server

    function createRoom() {
      console.debug("create_room", socket.readyState);
      if (socket.readyState)
        socket.send(JSON.stringify({ event: "create_room" }));
    }

    function joinRoom(id) {
      console.debug("join_room", socket.readyState);
      if (socket.readyState)
        socket.send(JSON.stringify({ event: "join_room", id }));
      else socket.onopen = () =>
        socket.send(JSON.stringify({ event: "join_room", id }));
    }

    function leaveRoom() {
      console.debug("leave_room", socket.readyState);
      if (socket.readyState) {
        socket.send(JSON.stringify({ event: "leave_room" }));
        store.set(undefined);
      }
    }

    function newCard() {
      console.debug("new_card", socket.readyState);
      if (socket.readyState)
        socket.send(JSON.stringify({ event: "new_card" }));
    }

    function updateCard(card) {
      console.debug("update_card", card);
      if (socket.readyState)
        socket.send(JSON.stringify({ event: "update_card", card: card ?? {} }));
    }

    function deleteCard(id) {
      console.debug("delete_card", socket.readyState);
      if (socket.readyState)
        socket.send(JSON.stringify({ event: "delete_card", id }));
    }

    var room = {
      subscribe: store.subscribe,
      set: store.set,
      create: createRoom,
      join: joinRoom,
      leave: leaveRoom,
      cards: {
        add: newCard,
        update: updateCard,
        delete: deleteCard,
      }
    };

    /* src\components\TextSpace.svelte generated by Svelte v3.44.2 */
    const file$5 = "src\\components\\TextSpace.svelte";

    // (37:2) {:else}
    function create_else_block$3(ctx) {
    	let div;
    	let p;
    	let t;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div = element("div");
    			p = element("p");
    			t = text(/*value*/ ctx[0]);
    			this.h();
    		},
    		l: function claim(nodes) {
    			div = claim_element(nodes, "DIV", {});
    			var div_nodes = children(div);
    			p = claim_element(div_nodes, "P", {});
    			var p_nodes = children(p);
    			t = claim_text(p_nodes, /*value*/ ctx[0]);
    			p_nodes.forEach(detach_dev);
    			div_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			add_location(p, file$5, 38, 6, 939);
    			add_location(div, file$5, 37, 4, 891);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, div, anchor);
    			append_hydration_dev(div, p);
    			append_hydration_dev(p, t);

    			if (!mounted) {
    				dispose = listen_dev(div, "dblclick", /*dblclick_handler*/ ctx[6], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*value*/ 1) set_data_dev(t, /*value*/ ctx[0]);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$3.name,
    		type: "else",
    		source: "(37:2) {:else}",
    		ctx
    	});

    	return block;
    }

    // (31:2) {#if focus}
    function create_if_block$5(ctx) {
    	let input;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			input = element("input");
    			this.h();
    		},
    		l: function claim(nodes) {
    			input = claim_element(nodes, "INPUT", { type: true, class: true });
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(input, "type", "text");
    			attr_dev(input, "class", "svelte-cjfe55");
    			add_location(input, file$5, 31, 4, 737);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, input, anchor);
    			set_input_value(input, /*copy*/ ctx[1]);

    			if (!mounted) {
    				dispose = [
    					listen_dev(input, "input", /*input_input_handler*/ ctx[4]),
    					listen_dev(input, "blur", /*blur_handler*/ ctx[5], false, false, false),
    					listen_dev(input, "keyup", prevent_default(/*handleKeyup*/ ctx[3]), false, true, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*copy*/ 2 && input.value !== /*copy*/ ctx[1]) {
    				set_input_value(input, /*copy*/ ctx[1]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(input);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$5.name,
    		type: "if",
    		source: "(31:2) {#if focus}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$7(ctx) {
    	let if_block_anchor;

    	function select_block_type(ctx, dirty) {
    		if (/*focus*/ ctx[2]) return create_if_block$5;
    		return create_else_block$3;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			if_block.l(nodes);
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if_block.m(target, anchor);
    			insert_hydration_dev(target, if_block_anchor, anchor);
    		},
    		p: function update(ctx, [dirty]) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$7.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('TextSpace', slots, []);
    	let { value = "" } = $$props;
    	let copy = `${value}`;
    	let focus = false;
    	const dispatch = createEventDispatcher();

    	function handleKeyup(e) {
    		if (e.code === "Enter") $$invalidate(2, focus = false);
    		dispatch("keyup");
    	}

    	const writable_props = ['value'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<TextSpace> was created with unknown prop '${key}'`);
    	});

    	function input_input_handler() {
    		copy = this.value;
    		(($$invalidate(1, copy), $$invalidate(2, focus)), $$invalidate(0, value));
    	}

    	const blur_handler = () => $$invalidate(2, focus = false);
    	const dblclick_handler = () => $$invalidate(2, focus = true);

    	$$self.$$set = $$props => {
    		if ('value' in $$props) $$invalidate(0, value = $$props.value);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		value,
    		copy,
    		focus,
    		dispatch,
    		handleKeyup
    	});

    	$$self.$inject_state = $$props => {
    		if ('value' in $$props) $$invalidate(0, value = $$props.value);
    		if ('copy' in $$props) $$invalidate(1, copy = $$props.copy);
    		if ('focus' in $$props) $$invalidate(2, focus = $$props.focus);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*focus, copy, value*/ 7) {
    			focus
    			? $$invalidate(0, value = copy)
    			: $$invalidate(1, copy = value);
    		}
    	};

    	return [
    		value,
    		copy,
    		focus,
    		handleKeyup,
    		input_input_handler,
    		blur_handler,
    		dblclick_handler
    	];
    }

    class TextSpace extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, { value: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "TextSpace",
    			options,
    			id: create_fragment$7.name
    		});
    	}

    	get value() {
    		throw new Error("<TextSpace>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set value(value) {
    		throw new Error("<TextSpace>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\Postit.svelte generated by Svelte v3.44.2 */
    const file$4 = "src\\components\\Postit.svelte";

    // (59:4) {#if hover}
    function create_if_block$4(ctx) {
    	let span;
    	let t;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			span = element("span");
    			t = text("X");
    			this.h();
    		},
    		l: function claim(nodes) {
    			span = claim_element(nodes, "SPAN", { class: true });
    			var span_nodes = children(span);
    			t = claim_text(span_nodes, "X");
    			span_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(span, "class", "remove svelte-1olh83o");
    			add_location(span, file$4, 59, 6, 1270);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, span, anchor);
    			append_hydration_dev(span, t);

    			if (!mounted) {
    				dispose = listen_dev(
    					span,
    					"click",
    					function () {
    						if (is_function(room.cards.delete(/*id*/ ctx[1]))) room.cards.delete(/*id*/ ctx[1]).apply(this, arguments);
    					},
    					false,
    					false,
    					false
    				);

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(span);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$4.name,
    		type: "if",
    		source: "(59:4) {#if hover}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$6(ctx) {
    	let div;
    	let t;
    	let textspace;
    	let updating_value;
    	let div_transition;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block = /*hover*/ ctx[3] && create_if_block$4(ctx);

    	function textspace_value_binding(value) {
    		/*textspace_value_binding*/ ctx[6](value);
    	}

    	let textspace_props = {};

    	if (/*text*/ ctx[0] !== void 0) {
    		textspace_props.value = /*text*/ ctx[0];
    	}

    	textspace = new TextSpace({ props: textspace_props, $$inline: true });
    	binding_callbacks.push(() => bind(textspace, 'value', textspace_value_binding));
    	textspace.$on("keyup", /*keyup_handler*/ ctx[7]);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if (if_block) if_block.c();
    			t = space();
    			create_component(textspace.$$.fragment);
    			this.h();
    		},
    		l: function claim(nodes) {
    			div = claim_element(nodes, "DIV", { id: true, class: true, draggable: true });
    			var div_nodes = children(div);
    			if (if_block) if_block.l(div_nodes);
    			t = claim_space(div_nodes);
    			claim_component(textspace.$$.fragment, div_nodes);
    			div_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(div, "id", /*id*/ ctx[1]);
    			attr_dev(div, "class", "postit svelte-1olh83o");
    			attr_dev(div, "draggable", "true");
    			add_location(div, file$4, 48, 2, 1030);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, div, anchor);
    			if (if_block) if_block.m(div, null);
    			append_hydration_dev(div, t);
    			mount_component(textspace, div, null);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(div, "mouseenter", /*handleMouseEnter*/ ctx[4], false, false, false),
    					listen_dev(div, "mouseleave", /*handleMouseLeave*/ ctx[5], false, false, false),
    					action_destroyer(draggable.call(null, div, {}))
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*hover*/ ctx[3]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$4(ctx);
    					if_block.c();
    					if_block.m(div, t);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			const textspace_changes = {};

    			if (!updating_value && dirty & /*text*/ 1) {
    				updating_value = true;
    				textspace_changes.value = /*text*/ ctx[0];
    				add_flush_callback(() => updating_value = false);
    			}

    			textspace.$set(textspace_changes);

    			if (!current || dirty & /*id*/ 2) {
    				attr_dev(div, "id", /*id*/ ctx[1]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(textspace.$$.fragment, local);

    			add_render_callback(() => {
    				if (!div_transition) div_transition = create_bidirectional_transition(div, fly, { y: -20, duration: 300 }, true);
    				div_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(textspace.$$.fragment, local);
    			if (!div_transition) div_transition = create_bidirectional_transition(div, fly, { y: -20, duration: 300 }, false);
    			div_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (if_block) if_block.d();
    			destroy_component(textspace);
    			if (detaching && div_transition) div_transition.end();
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Postit', slots, []);
    	let { text } = $$props;
    	let { id } = $$props;
    	let { card } = $$props;
    	let hover = false;

    	function handleMouseEnter() {
    		$$invalidate(3, hover = true);
    	}

    	function handleMouseLeave() {
    		$$invalidate(3, hover = false);
    	}

    	const writable_props = ['text', 'id', 'card'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Postit> was created with unknown prop '${key}'`);
    	});

    	function textspace_value_binding(value) {
    		text = value;
    		$$invalidate(0, text);
    	}

    	const keyup_handler = () => room.cards.update(card);

    	$$self.$$set = $$props => {
    		if ('text' in $$props) $$invalidate(0, text = $$props.text);
    		if ('id' in $$props) $$invalidate(1, id = $$props.id);
    		if ('card' in $$props) $$invalidate(2, card = $$props.card);
    	};

    	$$self.$capture_state = () => ({
    		fly,
    		draggable,
    		room,
    		TextSpace,
    		text,
    		id,
    		card,
    		hover,
    		handleMouseEnter,
    		handleMouseLeave
    	});

    	$$self.$inject_state = $$props => {
    		if ('text' in $$props) $$invalidate(0, text = $$props.text);
    		if ('id' in $$props) $$invalidate(1, id = $$props.id);
    		if ('card' in $$props) $$invalidate(2, card = $$props.card);
    		if ('hover' in $$props) $$invalidate(3, hover = $$props.hover);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		text,
    		id,
    		card,
    		hover,
    		handleMouseEnter,
    		handleMouseLeave,
    		textspace_value_binding,
    		keyup_handler
    	];
    }

    class Postit extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, { text: 0, id: 1, card: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Postit",
    			options,
    			id: create_fragment$6.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*text*/ ctx[0] === undefined && !('text' in props)) {
    			console.warn("<Postit> was created without expected prop 'text'");
    		}

    		if (/*id*/ ctx[1] === undefined && !('id' in props)) {
    			console.warn("<Postit> was created without expected prop 'id'");
    		}

    		if (/*card*/ ctx[2] === undefined && !('card' in props)) {
    			console.warn("<Postit> was created without expected prop 'card'");
    		}
    	}

    	get text() {
    		throw new Error("<Postit>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set text(value) {
    		throw new Error("<Postit>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get id() {
    		throw new Error("<Postit>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set id(value) {
    		throw new Error("<Postit>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get card() {
    		throw new Error("<Postit>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set card(value) {
    		throw new Error("<Postit>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const LOCATION = {};
    const ROUTER = {};

    /**
     * Adapted from https://github.com/reach/router/blob/b60e6dd781d5d3a4bdaaf4de665649c0f6a7e78d/src/lib/history.js
     *
     * https://github.com/reach/router/blob/master/LICENSE
     * */

    function getLocation(source) {
      return {
        ...source.location,
        state: source.history.state,
        key: (source.history.state && source.history.state.key) || "initial"
      };
    }

    function createHistory(source, options) {
      const listeners = [];
      let location = getLocation(source);

      return {
        get location() {
          return location;
        },

        listen(listener) {
          listeners.push(listener);

          const popstateListener = () => {
            location = getLocation(source);
            listener({ location, action: "POP" });
          };

          source.addEventListener("popstate", popstateListener);

          return () => {
            source.removeEventListener("popstate", popstateListener);

            const index = listeners.indexOf(listener);
            listeners.splice(index, 1);
          };
        },

        navigate(to, { state, replace = false } = {}) {
          state = { ...state, key: Date.now() + "" };
          // try...catch iOS Safari limits to 100 pushState calls
          try {
            if (replace) {
              source.history.replaceState(state, null, to);
            } else {
              source.history.pushState(state, null, to);
            }
          } catch (e) {
            source.location[replace ? "replace" : "assign"](to);
          }

          location = getLocation(source);
          listeners.forEach(listener => listener({ location, action: "PUSH" }));
        }
      };
    }

    // Stores history entries in memory for testing or other platforms like Native
    function createMemorySource(initialPathname = "/") {
      let index = 0;
      const stack = [{ pathname: initialPathname, search: "" }];
      const states = [];

      return {
        get location() {
          return stack[index];
        },
        addEventListener(name, fn) {},
        removeEventListener(name, fn) {},
        history: {
          get entries() {
            return stack;
          },
          get index() {
            return index;
          },
          get state() {
            return states[index];
          },
          pushState(state, _, uri) {
            const [pathname, search = ""] = uri.split("?");
            index++;
            stack.push({ pathname, search });
            states.push(state);
          },
          replaceState(state, _, uri) {
            const [pathname, search = ""] = uri.split("?");
            stack[index] = { pathname, search };
            states[index] = state;
          }
        }
      };
    }

    // Global history uses window.history as the source if available,
    // otherwise a memory history
    const canUseDOM = Boolean(
      typeof window !== "undefined" &&
        window.document &&
        window.document.createElement
    );
    const globalHistory = createHistory(canUseDOM ? window : createMemorySource());
    const { navigate } = globalHistory;

    /**
     * Adapted from https://github.com/reach/router/blob/b60e6dd781d5d3a4bdaaf4de665649c0f6a7e78d/src/lib/utils.js
     *
     * https://github.com/reach/router/blob/master/LICENSE
     * */

    const paramRe = /^:(.+)/;

    const SEGMENT_POINTS = 4;
    const STATIC_POINTS = 3;
    const DYNAMIC_POINTS = 2;
    const SPLAT_PENALTY = 1;
    const ROOT_POINTS = 1;

    /**
     * Check if `segment` is a root segment
     * @param {string} segment
     * @return {boolean}
     */
    function isRootSegment(segment) {
      return segment === "";
    }

    /**
     * Check if `segment` is a dynamic segment
     * @param {string} segment
     * @return {boolean}
     */
    function isDynamic(segment) {
      return paramRe.test(segment);
    }

    /**
     * Check if `segment` is a splat
     * @param {string} segment
     * @return {boolean}
     */
    function isSplat(segment) {
      return segment[0] === "*";
    }

    /**
     * Split up the URI into segments delimited by `/`
     * @param {string} uri
     * @return {string[]}
     */
    function segmentize(uri) {
      return (
        uri
          // Strip starting/ending `/`
          .replace(/(^\/+|\/+$)/g, "")
          .split("/")
      );
    }

    /**
     * Strip `str` of potential start and end `/`
     * @param {string} str
     * @return {string}
     */
    function stripSlashes(str) {
      return str.replace(/(^\/+|\/+$)/g, "");
    }

    /**
     * Score a route depending on how its individual segments look
     * @param {object} route
     * @param {number} index
     * @return {object}
     */
    function rankRoute(route, index) {
      const score = route.default
        ? 0
        : segmentize(route.path).reduce((score, segment) => {
            score += SEGMENT_POINTS;

            if (isRootSegment(segment)) {
              score += ROOT_POINTS;
            } else if (isDynamic(segment)) {
              score += DYNAMIC_POINTS;
            } else if (isSplat(segment)) {
              score -= SEGMENT_POINTS + SPLAT_PENALTY;
            } else {
              score += STATIC_POINTS;
            }

            return score;
          }, 0);

      return { route, score, index };
    }

    /**
     * Give a score to all routes and sort them on that
     * @param {object[]} routes
     * @return {object[]}
     */
    function rankRoutes(routes) {
      return (
        routes
          .map(rankRoute)
          // If two routes have the exact same score, we go by index instead
          .sort((a, b) =>
            a.score < b.score ? 1 : a.score > b.score ? -1 : a.index - b.index
          )
      );
    }

    /**
     * Ranks and picks the best route to match. Each segment gets the highest
     * amount of points, then the type of segment gets an additional amount of
     * points where
     *
     *  static > dynamic > splat > root
     *
     * This way we don't have to worry about the order of our routes, let the
     * computers do it.
     *
     * A route looks like this
     *
     *  { path, default, value }
     *
     * And a returned match looks like:
     *
     *  { route, params, uri }
     *
     * @param {object[]} routes
     * @param {string} uri
     * @return {?object}
     */
    function pick(routes, uri) {
      let match;
      let default_;

      const [uriPathname] = uri.split("?");
      const uriSegments = segmentize(uriPathname);
      const isRootUri = uriSegments[0] === "";
      const ranked = rankRoutes(routes);

      for (let i = 0, l = ranked.length; i < l; i++) {
        const route = ranked[i].route;
        let missed = false;

        if (route.default) {
          default_ = {
            route,
            params: {},
            uri
          };
          continue;
        }

        const routeSegments = segmentize(route.path);
        const params = {};
        const max = Math.max(uriSegments.length, routeSegments.length);
        let index = 0;

        for (; index < max; index++) {
          const routeSegment = routeSegments[index];
          const uriSegment = uriSegments[index];

          if (routeSegment !== undefined && isSplat(routeSegment)) {
            // Hit a splat, just grab the rest, and return a match
            // uri:   /files/documents/work
            // route: /files/* or /files/*splatname
            const splatName = routeSegment === "*" ? "*" : routeSegment.slice(1);

            params[splatName] = uriSegments
              .slice(index)
              .map(decodeURIComponent)
              .join("/");
            break;
          }

          if (uriSegment === undefined) {
            // URI is shorter than the route, no match
            // uri:   /users
            // route: /users/:userId
            missed = true;
            break;
          }

          let dynamicMatch = paramRe.exec(routeSegment);

          if (dynamicMatch && !isRootUri) {
            const value = decodeURIComponent(uriSegment);
            params[dynamicMatch[1]] = value;
          } else if (routeSegment !== uriSegment) {
            // Current segments don't match, not dynamic, not splat, so no match
            // uri:   /users/123/settings
            // route: /users/:id/profile
            missed = true;
            break;
          }
        }

        if (!missed) {
          match = {
            route,
            params,
            uri: "/" + uriSegments.slice(0, index).join("/")
          };
          break;
        }
      }

      return match || default_ || null;
    }

    /**
     * Check if the `path` matches the `uri`.
     * @param {string} path
     * @param {string} uri
     * @return {?object}
     */
    function match(route, uri) {
      return pick([route], uri);
    }

    /**
     * Combines the `basepath` and the `path` into one path.
     * @param {string} basepath
     * @param {string} path
     */
    function combinePaths(basepath, path) {
      return `${stripSlashes(
    path === "/" ? basepath : `${stripSlashes(basepath)}/${stripSlashes(path)}`
  )}/`;
    }

    /* node_modules\svelte-routing\src\Router.svelte generated by Svelte v3.44.2 */

    function create_fragment$5(ctx) {
    	let current;
    	const default_slot_template = /*#slots*/ ctx[9].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[8], null);

    	const block = {
    		c: function create() {
    			if (default_slot) default_slot.c();
    		},
    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(nodes);
    		},
    		m: function mount(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 256)) {
    					update_slot_base(
    						default_slot,
    						default_slot_template,
    						ctx,
    						/*$$scope*/ ctx[8],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[8])
    						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[8], dirty, null),
    						null
    					);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let $location;
    	let $routes;
    	let $base;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Router', slots, ['default']);
    	let { basepath = "/" } = $$props;
    	let { url = null } = $$props;
    	const locationContext = getContext(LOCATION);
    	const routerContext = getContext(ROUTER);
    	const routes = writable([]);
    	validate_store(routes, 'routes');
    	component_subscribe($$self, routes, value => $$invalidate(6, $routes = value));
    	const activeRoute = writable(null);
    	let hasActiveRoute = false; // Used in SSR to synchronously set that a Route is active.

    	// If locationContext is not set, this is the topmost Router in the tree.
    	// If the `url` prop is given we force the location to it.
    	const location = locationContext || writable(url ? { pathname: url } : globalHistory.location);

    	validate_store(location, 'location');
    	component_subscribe($$self, location, value => $$invalidate(5, $location = value));

    	// If routerContext is set, the routerBase of the parent Router
    	// will be the base for this Router's descendants.
    	// If routerContext is not set, the path and resolved uri will both
    	// have the value of the basepath prop.
    	const base = routerContext
    	? routerContext.routerBase
    	: writable({ path: basepath, uri: basepath });

    	validate_store(base, 'base');
    	component_subscribe($$self, base, value => $$invalidate(7, $base = value));

    	const routerBase = derived([base, activeRoute], ([base, activeRoute]) => {
    		// If there is no activeRoute, the routerBase will be identical to the base.
    		if (activeRoute === null) {
    			return base;
    		}

    		const { path: basepath } = base;
    		const { route, uri } = activeRoute;

    		// Remove the potential /* or /*splatname from
    		// the end of the child Routes relative paths.
    		const path = route.default
    		? basepath
    		: route.path.replace(/\*.*$/, "");

    		return { path, uri };
    	});

    	function registerRoute(route) {
    		const { path: basepath } = $base;
    		let { path } = route;

    		// We store the original path in the _path property so we can reuse
    		// it when the basepath changes. The only thing that matters is that
    		// the route reference is intact, so mutation is fine.
    		route._path = path;

    		route.path = combinePaths(basepath, path);

    		if (typeof window === "undefined") {
    			// In SSR we should set the activeRoute immediately if it is a match.
    			// If there are more Routes being registered after a match is found,
    			// we just skip them.
    			if (hasActiveRoute) {
    				return;
    			}

    			const matchingRoute = match(route, $location.pathname);

    			if (matchingRoute) {
    				activeRoute.set(matchingRoute);
    				hasActiveRoute = true;
    			}
    		} else {
    			routes.update(rs => {
    				rs.push(route);
    				return rs;
    			});
    		}
    	}

    	function unregisterRoute(route) {
    		routes.update(rs => {
    			const index = rs.indexOf(route);
    			rs.splice(index, 1);
    			return rs;
    		});
    	}

    	if (!locationContext) {
    		// The topmost Router in the tree is responsible for updating
    		// the location store and supplying it through context.
    		onMount(() => {
    			const unlisten = globalHistory.listen(history => {
    				location.set(history.location);
    			});

    			return unlisten;
    		});

    		setContext(LOCATION, location);
    	}

    	setContext(ROUTER, {
    		activeRoute,
    		base,
    		routerBase,
    		registerRoute,
    		unregisterRoute
    	});

    	const writable_props = ['basepath', 'url'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Router> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('basepath' in $$props) $$invalidate(3, basepath = $$props.basepath);
    		if ('url' in $$props) $$invalidate(4, url = $$props.url);
    		if ('$$scope' in $$props) $$invalidate(8, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		getContext,
    		setContext,
    		onMount,
    		writable,
    		derived,
    		LOCATION,
    		ROUTER,
    		globalHistory,
    		pick,
    		match,
    		stripSlashes,
    		combinePaths,
    		basepath,
    		url,
    		locationContext,
    		routerContext,
    		routes,
    		activeRoute,
    		hasActiveRoute,
    		location,
    		base,
    		routerBase,
    		registerRoute,
    		unregisterRoute,
    		$location,
    		$routes,
    		$base
    	});

    	$$self.$inject_state = $$props => {
    		if ('basepath' in $$props) $$invalidate(3, basepath = $$props.basepath);
    		if ('url' in $$props) $$invalidate(4, url = $$props.url);
    		if ('hasActiveRoute' in $$props) hasActiveRoute = $$props.hasActiveRoute;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$base*/ 128) {
    			// This reactive statement will update all the Routes' path when
    			// the basepath changes.
    			{
    				const { path: basepath } = $base;

    				routes.update(rs => {
    					rs.forEach(r => r.path = combinePaths(basepath, r._path));
    					return rs;
    				});
    			}
    		}

    		if ($$self.$$.dirty & /*$routes, $location*/ 96) {
    			// This reactive statement will be run when the Router is created
    			// when there are no Routes and then again the following tick, so it
    			// will not find an active Route in SSR and in the browser it will only
    			// pick an active Route after all Routes have been registered.
    			{
    				const bestMatch = pick($routes, $location.pathname);
    				activeRoute.set(bestMatch);
    			}
    		}
    	};

    	return [
    		routes,
    		location,
    		base,
    		basepath,
    		url,
    		$location,
    		$routes,
    		$base,
    		$$scope,
    		slots
    	];
    }

    class Router extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, { basepath: 3, url: 4 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Router",
    			options,
    			id: create_fragment$5.name
    		});
    	}

    	get basepath() {
    		throw new Error("<Router>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set basepath(value) {
    		throw new Error("<Router>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get url() {
    		throw new Error("<Router>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set url(value) {
    		throw new Error("<Router>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules\svelte-routing\src\Route.svelte generated by Svelte v3.44.2 */

    const get_default_slot_changes = dirty => ({
    	params: dirty & /*routeParams*/ 4,
    	location: dirty & /*$location*/ 16
    });

    const get_default_slot_context = ctx => ({
    	params: /*routeParams*/ ctx[2],
    	location: /*$location*/ ctx[4]
    });

    // (40:0) {#if $activeRoute !== null && $activeRoute.route === route}
    function create_if_block$3(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block_1$1, create_else_block$2];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*component*/ ctx[0] !== null) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			if_block.l(nodes);
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert_hydration_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$3.name,
    		type: "if",
    		source: "(40:0) {#if $activeRoute !== null && $activeRoute.route === route}",
    		ctx
    	});

    	return block;
    }

    // (43:2) {:else}
    function create_else_block$2(ctx) {
    	let current;
    	const default_slot_template = /*#slots*/ ctx[10].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[9], get_default_slot_context);

    	const block = {
    		c: function create() {
    			if (default_slot) default_slot.c();
    		},
    		l: function claim(nodes) {
    			if (default_slot) default_slot.l(nodes);
    		},
    		m: function mount(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope, routeParams, $location*/ 532)) {
    					update_slot_base(
    						default_slot,
    						default_slot_template,
    						ctx,
    						/*$$scope*/ ctx[9],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[9])
    						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[9], dirty, get_default_slot_changes),
    						get_default_slot_context
    					);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$2.name,
    		type: "else",
    		source: "(43:2) {:else}",
    		ctx
    	});

    	return block;
    }

    // (41:2) {#if component !== null}
    function create_if_block_1$1(ctx) {
    	let switch_instance;
    	let switch_instance_anchor;
    	let current;

    	const switch_instance_spread_levels = [
    		{ location: /*$location*/ ctx[4] },
    		/*routeParams*/ ctx[2],
    		/*routeProps*/ ctx[3]
    	];

    	var switch_value = /*component*/ ctx[0];

    	function switch_props(ctx) {
    		let switch_instance_props = {};

    		for (let i = 0; i < switch_instance_spread_levels.length; i += 1) {
    			switch_instance_props = assign(switch_instance_props, switch_instance_spread_levels[i]);
    		}

    		return {
    			props: switch_instance_props,
    			$$inline: true
    		};
    	}

    	if (switch_value) {
    		switch_instance = new switch_value(switch_props());
    	}

    	const block = {
    		c: function create() {
    			if (switch_instance) create_component(switch_instance.$$.fragment);
    			switch_instance_anchor = empty();
    		},
    		l: function claim(nodes) {
    			if (switch_instance) claim_component(switch_instance.$$.fragment, nodes);
    			switch_instance_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (switch_instance) {
    				mount_component(switch_instance, target, anchor);
    			}

    			insert_hydration_dev(target, switch_instance_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const switch_instance_changes = (dirty & /*$location, routeParams, routeProps*/ 28)
    			? get_spread_update(switch_instance_spread_levels, [
    					dirty & /*$location*/ 16 && { location: /*$location*/ ctx[4] },
    					dirty & /*routeParams*/ 4 && get_spread_object(/*routeParams*/ ctx[2]),
    					dirty & /*routeProps*/ 8 && get_spread_object(/*routeProps*/ ctx[3])
    				])
    			: {};

    			if (switch_value !== (switch_value = /*component*/ ctx[0])) {
    				if (switch_instance) {
    					group_outros();
    					const old_component = switch_instance;

    					transition_out(old_component.$$.fragment, 1, 0, () => {
    						destroy_component(old_component, 1);
    					});

    					check_outros();
    				}

    				if (switch_value) {
    					switch_instance = new switch_value(switch_props());
    					create_component(switch_instance.$$.fragment);
    					transition_in(switch_instance.$$.fragment, 1);
    					mount_component(switch_instance, switch_instance_anchor.parentNode, switch_instance_anchor);
    				} else {
    					switch_instance = null;
    				}
    			} else if (switch_value) {
    				switch_instance.$set(switch_instance_changes);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(switch_instance_anchor);
    			if (switch_instance) destroy_component(switch_instance, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$1.name,
    		type: "if",
    		source: "(41:2) {#if component !== null}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$4(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*$activeRoute*/ ctx[1] !== null && /*$activeRoute*/ ctx[1].route === /*route*/ ctx[7] && create_if_block$3(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			if (if_block) if_block.l(nodes);
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_hydration_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*$activeRoute*/ ctx[1] !== null && /*$activeRoute*/ ctx[1].route === /*route*/ ctx[7]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*$activeRoute*/ 2) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$3(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let $activeRoute;
    	let $location;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Route', slots, ['default']);
    	let { path = "" } = $$props;
    	let { component = null } = $$props;
    	const { registerRoute, unregisterRoute, activeRoute } = getContext(ROUTER);
    	validate_store(activeRoute, 'activeRoute');
    	component_subscribe($$self, activeRoute, value => $$invalidate(1, $activeRoute = value));
    	const location = getContext(LOCATION);
    	validate_store(location, 'location');
    	component_subscribe($$self, location, value => $$invalidate(4, $location = value));

    	const route = {
    		path,
    		// If no path prop is given, this Route will act as the default Route
    		// that is rendered if no other Route in the Router is a match.
    		default: path === ""
    	};

    	let routeParams = {};
    	let routeProps = {};
    	registerRoute(route);

    	// There is no need to unregister Routes in SSR since it will all be
    	// thrown away anyway.
    	if (typeof window !== "undefined") {
    		onDestroy(() => {
    			unregisterRoute(route);
    		});
    	}

    	$$self.$$set = $$new_props => {
    		$$invalidate(13, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    		if ('path' in $$new_props) $$invalidate(8, path = $$new_props.path);
    		if ('component' in $$new_props) $$invalidate(0, component = $$new_props.component);
    		if ('$$scope' in $$new_props) $$invalidate(9, $$scope = $$new_props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		getContext,
    		onDestroy,
    		ROUTER,
    		LOCATION,
    		path,
    		component,
    		registerRoute,
    		unregisterRoute,
    		activeRoute,
    		location,
    		route,
    		routeParams,
    		routeProps,
    		$activeRoute,
    		$location
    	});

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(13, $$props = assign(assign({}, $$props), $$new_props));
    		if ('path' in $$props) $$invalidate(8, path = $$new_props.path);
    		if ('component' in $$props) $$invalidate(0, component = $$new_props.component);
    		if ('routeParams' in $$props) $$invalidate(2, routeParams = $$new_props.routeParams);
    		if ('routeProps' in $$props) $$invalidate(3, routeProps = $$new_props.routeProps);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$activeRoute*/ 2) {
    			if ($activeRoute && $activeRoute.route === route) {
    				$$invalidate(2, routeParams = $activeRoute.params);
    			}
    		}

    		{
    			const { path, component, ...rest } = $$props;
    			$$invalidate(3, routeProps = rest);
    		}
    	};

    	$$props = exclude_internal_props($$props);

    	return [
    		component,
    		$activeRoute,
    		routeParams,
    		routeProps,
    		$location,
    		activeRoute,
    		location,
    		route,
    		path,
    		$$scope,
    		slots
    	];
    }

    class Route extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, { path: 8, component: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Route",
    			options,
    			id: create_fragment$4.name
    		});
    	}

    	get path() {
    		throw new Error("<Route>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set path(value) {
    		throw new Error("<Route>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get component() {
    		throw new Error("<Route>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set component(value) {
    		throw new Error("<Route>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\routes\Board.svelte generated by Svelte v3.44.2 */
    const file$3 = "src\\routes\\Board.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[7] = list[i];
    	child_ctx[8] = list;
    	child_ctx[9] = i;
    	return child_ctx;
    }

    // (142:12) {:else}
    function create_else_block$1(ctx) {
    	let p;
    	let t;

    	const block = {
    		c: function create() {
    			p = element("p");
    			t = text("Add some post-its");
    			this.h();
    		},
    		l: function claim(nodes) {
    			p = claim_element(nodes, "P", {});
    			var p_nodes = children(p);
    			t = claim_text(p_nodes, "Add some post-its");
    			p_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			add_location(p, file$3, 142, 14, 3271);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, p, anchor);
    			append_hydration_dev(p, t);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$1.name,
    		type: "else",
    		source: "(142:12) {:else}",
    		ctx
    	});

    	return block;
    }

    // (138:12) {#if $room.cards.length > 0}
    function create_if_block$2(ctx) {
    	let each_1_anchor;
    	let current;
    	let each_value = /*$room*/ ctx[1].cards;
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		l: function claim(nodes) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].l(nodes);
    			}

    			each_1_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_hydration_dev(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$room*/ 2) {
    				each_value = /*$room*/ ctx[1].cards;
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$2.name,
    		type: "if",
    		source: "(138:12) {#if $room.cards.length > 0}",
    		ctx
    	});

    	return block;
    }

    // (139:14) {#each $room.cards as card}
    function create_each_block(ctx) {
    	let postit;
    	let updating_text;
    	let updating_id;
    	let updating_card;
    	let current;

    	function postit_text_binding(value) {
    		/*postit_text_binding*/ ctx[3](value, /*card*/ ctx[7]);
    	}

    	function postit_id_binding(value) {
    		/*postit_id_binding*/ ctx[4](value, /*card*/ ctx[7]);
    	}

    	function postit_card_binding(value) {
    		/*postit_card_binding*/ ctx[5](value, /*card*/ ctx[7], /*each_value*/ ctx[8], /*card_index*/ ctx[9]);
    	}

    	let postit_props = {};

    	if (/*card*/ ctx[7].body !== void 0) {
    		postit_props.text = /*card*/ ctx[7].body;
    	}

    	if (/*card*/ ctx[7].id !== void 0) {
    		postit_props.id = /*card*/ ctx[7].id;
    	}

    	if (/*card*/ ctx[7] !== void 0) {
    		postit_props.card = /*card*/ ctx[7];
    	}

    	postit = new Postit({ props: postit_props, $$inline: true });
    	binding_callbacks.push(() => bind(postit, 'text', postit_text_binding));
    	binding_callbacks.push(() => bind(postit, 'id', postit_id_binding));
    	binding_callbacks.push(() => bind(postit, 'card', postit_card_binding));

    	const block = {
    		c: function create() {
    			create_component(postit.$$.fragment);
    		},
    		l: function claim(nodes) {
    			claim_component(postit.$$.fragment, nodes);
    		},
    		m: function mount(target, anchor) {
    			mount_component(postit, target, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			const postit_changes = {};

    			if (!updating_text && dirty & /*$room*/ 2) {
    				updating_text = true;
    				postit_changes.text = /*card*/ ctx[7].body;
    				add_flush_callback(() => updating_text = false);
    			}

    			if (!updating_id && dirty & /*$room*/ 2) {
    				updating_id = true;
    				postit_changes.id = /*card*/ ctx[7].id;
    				add_flush_callback(() => updating_id = false);
    			}

    			if (!updating_card && dirty & /*$room*/ 2) {
    				updating_card = true;
    				postit_changes.card = /*card*/ ctx[7];
    				add_flush_callback(() => updating_card = false);
    			}

    			postit.$set(postit_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(postit.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(postit.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(postit, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(139:14) {#each $room.cards as card}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$3(ctx) {
    	let main;
    	let div3;
    	let header;
    	let h1;
    	let fa0;
    	let t0;
    	let t1;
    	let nav;
    	let div0;
    	let fa1;
    	let t2;
    	let span;
    	let t3;
    	let t4;
    	let div2;
    	let div1;
    	let current_block_type_index;
    	let if_block;
    	let t5;
    	let sidebar;
    	let updating_show;
    	let current;
    	let mounted;
    	let dispose;

    	fa0 = new Fa({
    			props: { icon: faClone, size: "sm" },
    			$$inline: true
    		});

    	fa1 = new Fa({
    			props: { icon: faPlus, size: "sm" },
    			$$inline: true
    		});

    	const if_block_creators = [create_if_block$2, create_else_block$1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*$room*/ ctx[1].cards.length > 0) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	function sidebar_show_binding(value) {
    		/*sidebar_show_binding*/ ctx[6](value);
    	}

    	let sidebar_props = {};

    	if (/*sidebar_show*/ ctx[0] !== void 0) {
    		sidebar_props.show = /*sidebar_show*/ ctx[0];
    	}

    	sidebar = new Sidebar({ props: sidebar_props, $$inline: true });
    	binding_callbacks.push(() => bind(sidebar, 'show', sidebar_show_binding));
    	sidebar.$on("create", room.cards.add);

    	const block = {
    		c: function create() {
    			main = element("main");
    			div3 = element("div");
    			header = element("header");
    			h1 = element("h1");
    			create_component(fa0.$$.fragment);
    			t0 = text("\r\n        Padlet Time");
    			t1 = space();
    			nav = element("nav");
    			div0 = element("div");
    			create_component(fa1.$$.fragment);
    			t2 = space();
    			span = element("span");
    			t3 = text("Actions");
    			t4 = space();
    			div2 = element("div");
    			div1 = element("div");
    			if_block.c();
    			t5 = space();
    			create_component(sidebar.$$.fragment);
    			this.h();
    		},
    		l: function claim(nodes) {
    			main = claim_element(nodes, "MAIN", {});
    			var main_nodes = children(main);
    			div3 = claim_element(main_nodes, "DIV", { id: true, class: true });
    			var div3_nodes = children(div3);
    			header = claim_element(div3_nodes, "HEADER", { class: true });
    			var header_nodes = children(header);
    			h1 = claim_element(header_nodes, "H1", {});
    			var h1_nodes = children(h1);
    			claim_component(fa0.$$.fragment, h1_nodes);
    			t0 = claim_text(h1_nodes, "\r\n        Padlet Time");
    			h1_nodes.forEach(detach_dev);
    			t1 = claim_space(header_nodes);
    			nav = claim_element(header_nodes, "NAV", { class: true });
    			var nav_nodes = children(nav);
    			div0 = claim_element(nav_nodes, "DIV", { class: true });
    			var div0_nodes = children(div0);
    			claim_component(fa1.$$.fragment, div0_nodes);
    			t2 = claim_space(div0_nodes);
    			span = claim_element(div0_nodes, "SPAN", { class: true });
    			var span_nodes = children(span);
    			t3 = claim_text(span_nodes, "Actions");
    			span_nodes.forEach(detach_dev);
    			div0_nodes.forEach(detach_dev);
    			nav_nodes.forEach(detach_dev);
    			header_nodes.forEach(detach_dev);
    			t4 = claim_space(div3_nodes);
    			div2 = claim_element(div3_nodes, "DIV", { class: true });
    			var div2_nodes = children(div2);
    			div1 = claim_element(div2_nodes, "DIV", { class: true });
    			var div1_nodes = children(div1);
    			if_block.l(div1_nodes);
    			div1_nodes.forEach(detach_dev);
    			t5 = claim_space(div2_nodes);
    			claim_component(sidebar.$$.fragment, div2_nodes);
    			div2_nodes.forEach(detach_dev);
    			div3_nodes.forEach(detach_dev);
    			main_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			add_location(h1, file$3, 124, 12, 2642);
    			attr_dev(span, "class", "svelte-ncl1pu");
    			add_location(span, file$3, 131, 20, 2896);
    			attr_dev(div0, "class", "svelte-ncl1pu");
    			add_location(div0, file$3, 129, 16, 2772);
    			attr_dev(nav, "class", "svelte-ncl1pu");
    			add_location(nav, file$3, 128, 12, 2749);
    			attr_dev(header, "class", "svelte-ncl1pu");
    			add_location(header, file$3, 123, 8, 2620);
    			attr_dev(div1, "class", "grid svelte-ncl1pu");
    			add_location(div1, file$3, 136, 10, 3024);
    			attr_dev(div2, "class", "container svelte-ncl1pu");
    			add_location(div2, file$3, 135, 8, 2989);
    			attr_dev(div3, "id", "app-container");
    			attr_dev(div3, "class", "svelte-ncl1pu");
    			add_location(div3, file$3, 122, 4, 2586);
    			add_location(main, file$3, 121, 0, 2574);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, main, anchor);
    			append_hydration_dev(main, div3);
    			append_hydration_dev(div3, header);
    			append_hydration_dev(header, h1);
    			mount_component(fa0, h1, null);
    			append_hydration_dev(h1, t0);
    			append_hydration_dev(header, t1);
    			append_hydration_dev(header, nav);
    			append_hydration_dev(nav, div0);
    			mount_component(fa1, div0, null);
    			append_hydration_dev(div0, t2);
    			append_hydration_dev(div0, span);
    			append_hydration_dev(span, t3);
    			append_hydration_dev(div3, t4);
    			append_hydration_dev(div3, div2);
    			append_hydration_dev(div2, div1);
    			if_blocks[current_block_type_index].m(div1, null);
    			append_hydration_dev(div2, t5);
    			mount_component(sidebar, div2, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(div0, "click", /*click_handler*/ ctx[2], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(div1, null);
    			}

    			const sidebar_changes = {};

    			if (!updating_show && dirty & /*sidebar_show*/ 1) {
    				updating_show = true;
    				sidebar_changes.show = /*sidebar_show*/ ctx[0];
    				add_flush_callback(() => updating_show = false);
    			}

    			sidebar.$set(sidebar_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(fa0.$$.fragment, local);
    			transition_in(fa1.$$.fragment, local);
    			transition_in(if_block);
    			transition_in(sidebar.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(fa0.$$.fragment, local);
    			transition_out(fa1.$$.fragment, local);
    			transition_out(if_block);
    			transition_out(sidebar.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(main);
    			destroy_component(fa0);
    			destroy_component(fa1);
    			if_blocks[current_block_type_index].d();
    			destroy_component(sidebar);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let $room;
    	validate_store(room, 'room');
    	component_subscribe($$self, room, $$value => $$invalidate(1, $room = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Board', slots, []);

    	onMount(() => {
    		// If room does not exist, go back to home page
    		if (!$room && $room.id) {
    			room.leave();
    			navigate("/", { replace: true });
    		}
    	});

    	onDestroy(() => {
    		// Tell the server we're leaving the room
    		if ($room && $room.id) {
    			room.leave();
    		}
    	});

    	let sidebar_show = false;
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Board> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => $$invalidate(0, sidebar_show = !sidebar_show);

    	function postit_text_binding(value, card) {
    		if ($$self.$$.not_equal(card.body, value)) {
    			card.body = value;
    			room.set($room);
    		}
    	}

    	function postit_id_binding(value, card) {
    		if ($$self.$$.not_equal(card.id, value)) {
    			card.id = value;
    			room.set($room);
    		}
    	}

    	function postit_card_binding(value, card, each_value, card_index) {
    		each_value[card_index] = value;
    		room.set($room);
    	}

    	function sidebar_show_binding(value) {
    		sidebar_show = value;
    		$$invalidate(0, sidebar_show);
    	}

    	$$self.$capture_state = () => ({
    		Fa,
    		faClone,
    		faPlus,
    		Sidebar,
    		Postit,
    		room,
    		onMount,
    		onDestroy,
    		navigate,
    		sidebar_show,
    		$room
    	});

    	$$self.$inject_state = $$props => {
    		if ('sidebar_show' in $$props) $$invalidate(0, sidebar_show = $$props.sidebar_show);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		sidebar_show,
    		$room,
    		click_handler,
    		postit_text_binding,
    		postit_id_binding,
    		postit_card_binding,
    		sidebar_show_binding
    	];
    }

    class Board extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Board",
    			options,
    			id: create_fragment$3.name
    		});
    	}
    }

    /* src\components\Toast.svelte generated by Svelte v3.44.2 */
    const file$2 = "src\\components\\Toast.svelte";

    // (39:2) {#if $toast}
    function create_if_block$1(ctx) {
    	let div1;
    	let div0;
    	let t;
    	let div1_intro;
    	let div1_outro;
    	let current;

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			t = text(/*$toast*/ ctx[0]);
    			this.h();
    		},
    		l: function claim(nodes) {
    			div1 = claim_element(nodes, "DIV", { class: true });
    			var div1_nodes = children(div1);
    			div0 = claim_element(div1_nodes, "DIV", { class: true });
    			var div0_nodes = children(div0);
    			t = claim_text(div0_nodes, /*$toast*/ ctx[0]);
    			div0_nodes.forEach(detach_dev);
    			div1_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(div0, "class", "message svelte-173jzku");
    			add_location(div0, file$2, 43, 6, 1026);
    			attr_dev(div1, "class", "toast svelte-173jzku");
    			add_location(div1, file$2, 39, 4, 907);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, div1, anchor);
    			append_hydration_dev(div1, div0);
    			append_hydration_dev(div0, t);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (!current || dirty & /*$toast*/ 1) set_data_dev(t, /*$toast*/ ctx[0]);
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (div1_outro) div1_outro.end(1);
    				div1_intro = create_in_transition(div1, fly, { y: -50, duration: 800 });
    				div1_intro.start();
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (div1_intro) div1_intro.invalidate();
    			div1_outro = create_out_transition(div1, fly, { y: -50, duration: 800 });
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			if (detaching && div1_outro) div1_outro.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(39:2) {#if $toast}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$2(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*$toast*/ ctx[0] && create_if_block$1(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			if (if_block) if_block.l(nodes);
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_hydration_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*$toast*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*$toast*/ 1) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$1(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let $toast;
    	validate_store(toast, 'toast');
    	component_subscribe($$self, toast, $$value => $$invalidate(0, $toast = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Toast', slots, []);
    	let timeout;
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Toast> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({ toast, fly, timeout, $toast });

    	$$self.$inject_state = $$props => {
    		if ('timeout' in $$props) $$invalidate(1, timeout = $$props.timeout);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$toast, timeout*/ 3) {
    			{
    				(clearTimeout(timeout));
    				$$invalidate(1, timeout = setTimeout(() => toast.set(undefined), 4000));
    			}
    		}
    	};

    	return [$toast, timeout];
    }

    class Toast extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Toast",
    			options,
    			id: create_fragment$2.name
    		});
    	}
    }

    /* src\routes\Choice.svelte generated by Svelte v3.44.2 */
    const file$1 = "src\\routes\\Choice.svelte";

    // (135:4) {:else}
    function create_else_block(ctx) {
    	let h2;
    	let t0;
    	let t1;
    	let div0;
    	let button0;
    	let t2;
    	let t3;
    	let div1;
    	let button1;
    	let t4;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			h2 = element("h2");
    			t0 = text("Choix d'action");
    			t1 = space();
    			div0 = element("div");
    			button0 = element("button");
    			t2 = text("Accéder à une salle");
    			t3 = space();
    			div1 = element("div");
    			button1 = element("button");
    			t4 = text("crée une salle");
    			this.h();
    		},
    		l: function claim(nodes) {
    			h2 = claim_element(nodes, "H2", { class: true });
    			var h2_nodes = children(h2);
    			t0 = claim_text(h2_nodes, "Choix d'action");
    			h2_nodes.forEach(detach_dev);
    			t1 = claim_space(nodes);
    			div0 = claim_element(nodes, "DIV", { class: true });
    			var div0_nodes = children(div0);
    			button0 = claim_element(div0_nodes, "BUTTON", { class: true });
    			var button0_nodes = children(button0);
    			t2 = claim_text(button0_nodes, "Accéder à une salle");
    			button0_nodes.forEach(detach_dev);
    			div0_nodes.forEach(detach_dev);
    			t3 = claim_space(nodes);
    			div1 = claim_element(nodes, "DIV", { class: true });
    			var div1_nodes = children(div1);
    			button1 = claim_element(div1_nodes, "BUTTON", { class: true });
    			var button1_nodes = children(button1);
    			t4 = claim_text(button1_nodes, "crée une salle");
    			button1_nodes.forEach(detach_dev);
    			div1_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(h2, "class", "svelte-733qr1");
    			add_location(h2, file$1, 135, 4, 3885);
    			attr_dev(button0, "class", "svelte-733qr1");
    			add_location(button0, file$1, 137, 12, 3954);
    			attr_dev(div0, "class", "inputBox svelte-733qr1");
    			add_location(div0, file$1, 136, 8, 3918);
    			attr_dev(button1, "class", "svelte-733qr1");
    			add_location(button1, file$1, 140, 12, 4099);
    			attr_dev(div1, "class", "inputBox svelte-733qr1");
    			add_location(div1, file$1, 139, 8, 4063);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, h2, anchor);
    			append_hydration_dev(h2, t0);
    			insert_hydration_dev(target, t1, anchor);
    			insert_hydration_dev(target, div0, anchor);
    			append_hydration_dev(div0, button0);
    			append_hydration_dev(button0, t2);
    			insert_hydration_dev(target, t3, anchor);
    			insert_hydration_dev(target, div1, anchor);
    			append_hydration_dev(div1, button1);
    			append_hydration_dev(button1, t4);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "click", /*click_handler_2*/ ctx[7], false, false, false),
    					listen_dev(button1, "click", /*click_handler_3*/ ctx[8], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h2);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(div0);
    			if (detaching) detach_dev(t3);
    			if (detaching) detach_dev(div1);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(135:4) {:else}",
    		ctx
    	});

    	return block;
    }

    // (126:29) 
    function create_if_block_1(ctx) {
    	let button0;
    	let fa;
    	let t0;
    	let div0;
    	let label;
    	let t1;
    	let t2;
    	let input;
    	let t3;
    	let div1;
    	let button1;
    	let t4;
    	let current;
    	let mounted;
    	let dispose;

    	fa = new Fa({
    			props: { icon: faArrowAltCircleLeft, size: "2x" },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			button0 = element("button");
    			create_component(fa.$$.fragment);
    			t0 = space();
    			div0 = element("div");
    			label = element("label");
    			t1 = text("Nom de la salle");
    			t2 = space();
    			input = element("input");
    			t3 = space();
    			div1 = element("div");
    			button1 = element("button");
    			t4 = text("Entrer");
    			this.h();
    		},
    		l: function claim(nodes) {
    			button0 = claim_element(nodes, "BUTTON", { class: true });
    			var button0_nodes = children(button0);
    			claim_component(fa.$$.fragment, button0_nodes);
    			button0_nodes.forEach(detach_dev);
    			t0 = claim_space(nodes);
    			div0 = claim_element(nodes, "DIV", { class: true });
    			var div0_nodes = children(div0);
    			label = claim_element(div0_nodes, "LABEL", { for: true, class: true });
    			var label_nodes = children(label);
    			t1 = claim_text(label_nodes, "Nom de la salle");
    			label_nodes.forEach(detach_dev);
    			t2 = claim_space(div0_nodes);

    			input = claim_element(div0_nodes, "INPUT", {
    				type: true,
    				name: true,
    				id: true,
    				placeholder: true,
    				class: true
    			});

    			div0_nodes.forEach(detach_dev);
    			t3 = claim_space(nodes);
    			div1 = claim_element(nodes, "DIV", { style: true, class: true });
    			var div1_nodes = children(div1);

    			button1 = claim_element(div1_nodes, "BUTTON", {
    				type: true,
    				name: true,
    				style: true,
    				class: true
    			});

    			var button1_nodes = children(button1);
    			t4 = claim_text(button1_nodes, "Entrer");
    			button1_nodes.forEach(detach_dev);
    			div1_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(button0, "class", "back svelte-733qr1");
    			add_location(button0, file$1, 126, 4, 3353);
    			attr_dev(label, "for", "userName");
    			attr_dev(label, "class", "svelte-733qr1");
    			add_location(label, file$1, 128, 12, 3514);
    			attr_dev(input, "type", "text");
    			attr_dev(input, "name", "name");
    			attr_dev(input, "id", "name");
    			attr_dev(input, "placeholder", "type room name");
    			input.required = true;
    			attr_dev(input, "class", "svelte-733qr1");
    			add_location(input, file$1, 129, 12, 3573);
    			attr_dev(div0, "class", "inputBox svelte-733qr1");
    			add_location(div0, file$1, 127, 8, 3478);
    			attr_dev(button1, "type", "submit");
    			attr_dev(button1, "name", "");
    			set_style(button1, "float", "left");
    			attr_dev(button1, "class", "svelte-733qr1");
    			add_location(button1, file$1, 132, 12, 3746);
    			set_style(div1, "align-items", "center");
    			attr_dev(div1, "class", "svelte-733qr1");
    			add_location(div1, file$1, 131, 8, 3698);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, button0, anchor);
    			mount_component(fa, button0, null);
    			insert_hydration_dev(target, t0, anchor);
    			insert_hydration_dev(target, div0, anchor);
    			append_hydration_dev(div0, label);
    			append_hydration_dev(label, t1);
    			append_hydration_dev(div0, t2);
    			append_hydration_dev(div0, input);
    			set_input_value(input, /*value*/ ctx[2]);
    			insert_hydration_dev(target, t3, anchor);
    			insert_hydration_dev(target, div1, anchor);
    			append_hydration_dev(div1, button1);
    			append_hydration_dev(button1, t4);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "click", /*click_handler_1*/ ctx[5], false, false, false),
    					listen_dev(input, "input", /*input_input_handler_1*/ ctx[6]),
    					listen_dev(
    						button1,
    						"click",
    						function () {
    							if (is_function(room.join(parseInt(/*value*/ ctx[2])))) room.join(parseInt(/*value*/ ctx[2])).apply(this, arguments);
    						},
    						false,
    						false,
    						false
    					)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty & /*value*/ 4 && input.value !== /*value*/ ctx[2]) {
    				set_input_value(input, /*value*/ ctx[2]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(fa.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(fa.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button0);
    			destroy_component(fa);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(div0);
    			if (detaching) detach_dev(t3);
    			if (detaching) detach_dev(div1);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(126:29) ",
    		ctx
    	});

    	return block;
    }

    // (117:4) {#if showInputCreate}
    function create_if_block(ctx) {
    	let button0;
    	let fa;
    	let t0;
    	let div0;
    	let label;
    	let t1;
    	let t2;
    	let input;
    	let t3;
    	let div1;
    	let button1;
    	let t4;
    	let current;
    	let mounted;
    	let dispose;

    	fa = new Fa({
    			props: { icon: faArrowAltCircleLeft, size: "2x" },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			button0 = element("button");
    			create_component(fa.$$.fragment);
    			t0 = space();
    			div0 = element("div");
    			label = element("label");
    			t1 = text("Nom de la salle");
    			t2 = space();
    			input = element("input");
    			t3 = space();
    			div1 = element("div");
    			button1 = element("button");
    			t4 = text("Valider");
    			this.h();
    		},
    		l: function claim(nodes) {
    			button0 = claim_element(nodes, "BUTTON", { class: true });
    			var button0_nodes = children(button0);
    			claim_component(fa.$$.fragment, button0_nodes);
    			button0_nodes.forEach(detach_dev);
    			t0 = claim_space(nodes);
    			div0 = claim_element(nodes, "DIV", { class: true });
    			var div0_nodes = children(div0);
    			label = claim_element(div0_nodes, "LABEL", { for: true, class: true });
    			var label_nodes = children(label);
    			t1 = claim_text(label_nodes, "Nom de la salle");
    			label_nodes.forEach(detach_dev);
    			t2 = claim_space(div0_nodes);

    			input = claim_element(div0_nodes, "INPUT", {
    				type: true,
    				name: true,
    				id: true,
    				placeholder: true,
    				class: true
    			});

    			div0_nodes.forEach(detach_dev);
    			t3 = claim_space(nodes);
    			div1 = claim_element(nodes, "DIV", { style: true, class: true });
    			var div1_nodes = children(div1);

    			button1 = claim_element(div1_nodes, "BUTTON", {
    				type: true,
    				name: true,
    				style: true,
    				class: true
    			});

    			var button1_nodes = children(button1);
    			t4 = claim_text(button1_nodes, "Valider");
    			button1_nodes.forEach(detach_dev);
    			div1_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(button0, "class", "back svelte-733qr1");
    			add_location(button0, file$1, 117, 4, 2816);
    			attr_dev(label, "for", "userName");
    			attr_dev(label, "class", "svelte-733qr1");
    			add_location(label, file$1, 119, 12, 2978);
    			attr_dev(input, "type", "text");
    			attr_dev(input, "name", "name");
    			attr_dev(input, "id", "name");
    			attr_dev(input, "placeholder", "type room name");
    			input.required = true;
    			attr_dev(input, "class", "svelte-733qr1");
    			add_location(input, file$1, 120, 12, 3037);
    			attr_dev(div0, "class", "inputBox svelte-733qr1");
    			add_location(div0, file$1, 118, 8, 2942);
    			attr_dev(button1, "type", "submit");
    			attr_dev(button1, "name", "");
    			set_style(button1, "float", "left");
    			attr_dev(button1, "class", "svelte-733qr1");
    			add_location(button1, file$1, 123, 12, 3210);
    			set_style(div1, "align-items", "center");
    			attr_dev(div1, "class", "svelte-733qr1");
    			add_location(div1, file$1, 122, 8, 3162);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, button0, anchor);
    			mount_component(fa, button0, null);
    			insert_hydration_dev(target, t0, anchor);
    			insert_hydration_dev(target, div0, anchor);
    			append_hydration_dev(div0, label);
    			append_hydration_dev(label, t1);
    			append_hydration_dev(div0, t2);
    			append_hydration_dev(div0, input);
    			set_input_value(input, /*value*/ ctx[2]);
    			insert_hydration_dev(target, t3, anchor);
    			insert_hydration_dev(target, div1, anchor);
    			append_hydration_dev(div1, button1);
    			append_hydration_dev(button1, t4);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "click", /*click_handler*/ ctx[3], false, false, false),
    					listen_dev(input, "input", /*input_input_handler*/ ctx[4]),
    					listen_dev(button1, "click", room.create, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*value*/ 4 && input.value !== /*value*/ ctx[2]) {
    				set_input_value(input, /*value*/ ctx[2]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(fa.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(fa.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button0);
    			destroy_component(fa);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(div0);
    			if (detaching) detach_dev(t3);
    			if (detaching) detach_dev(div1);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(117:4) {#if showInputCreate}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let particles;
    	let t0;
    	let main;
    	let current_block_type_index;
    	let if_block;
    	let t1;
    	let footer;
    	let current;

    	particles = new Particles({
    			props: {
    				id: "tsparticles",
    				options: particlesConfig
    			},
    			$$inline: true
    		});

    	const if_block_creators = [create_if_block, create_if_block_1, create_else_block];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*showInputCreate*/ ctx[0]) return 0;
    		if (/*showInputEnter*/ ctx[1]) return 1;
    		return 2;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			create_component(particles.$$.fragment);
    			t0 = space();
    			main = element("main");
    			if_block.c();
    			t1 = space();
    			footer = element("footer");
    			this.h();
    		},
    		l: function claim(nodes) {
    			claim_component(particles.$$.fragment, nodes);
    			t0 = claim_space(nodes);
    			main = claim_element(nodes, "MAIN", { class: true });
    			var main_nodes = children(main);
    			if_block.l(main_nodes);
    			main_nodes.forEach(detach_dev);
    			t1 = claim_space(nodes);
    			footer = claim_element(nodes, "FOOTER", { class: true });
    			var footer_nodes = children(footer);
    			footer_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(main, "class", "box svelte-733qr1");
    			add_location(main, file$1, 115, 0, 2765);
    			attr_dev(footer, "class", "svelte-733qr1");
    			add_location(footer, file$1, 144, 0, 4210);
    		},
    		m: function mount(target, anchor) {
    			mount_component(particles, target, anchor);
    			insert_hydration_dev(target, t0, anchor);
    			insert_hydration_dev(target, main, anchor);
    			if_blocks[current_block_type_index].m(main, null);
    			insert_hydration_dev(target, t1, anchor);
    			insert_hydration_dev(target, footer, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(main, null);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(particles.$$.fragment, local);
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(particles.$$.fragment, local);
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(particles, detaching);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(main);
    			if_blocks[current_block_type_index].d();
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(footer);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Choice', slots, []);
    	let showInputCreate = false;
    	let showInputEnter = false;
    	let value = undefined;
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Choice> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => $$invalidate(0, showInputCreate = false);

    	function input_input_handler() {
    		value = this.value;
    		$$invalidate(2, value);
    	}

    	const click_handler_1 = () => $$invalidate(1, showInputEnter = false);

    	function input_input_handler_1() {
    		value = this.value;
    		$$invalidate(2, value);
    	}

    	const click_handler_2 = () => $$invalidate(1, showInputEnter = true);
    	const click_handler_3 = () => $$invalidate(0, showInputCreate = true);

    	$$self.$capture_state = () => ({
    		Particles,
    		particlesConfig,
    		Fa,
    		faArrowAltCircleLeft,
    		room,
    		showInputCreate,
    		showInputEnter,
    		value
    	});

    	$$self.$inject_state = $$props => {
    		if ('showInputCreate' in $$props) $$invalidate(0, showInputCreate = $$props.showInputCreate);
    		if ('showInputEnter' in $$props) $$invalidate(1, showInputEnter = $$props.showInputEnter);
    		if ('value' in $$props) $$invalidate(2, value = $$props.value);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		showInputCreate,
    		showInputEnter,
    		value,
    		click_handler,
    		input_input_handler,
    		click_handler_1,
    		input_input_handler_1,
    		click_handler_2,
    		click_handler_3
    	];
    }

    class Choice extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Choice",
    			options,
    			id: create_fragment$1.name
    		});
    	}
    }

    /* src\App.svelte generated by Svelte v3.44.2 */
    const file = "src\\App.svelte";

    // (23:8) <Route path="/">
    function create_default_slot_4(ctx) {
    	let login;
    	let current;
    	login = new Login({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(login.$$.fragment);
    		},
    		l: function claim(nodes) {
    			claim_component(login.$$.fragment, nodes);
    		},
    		m: function mount(target, anchor) {
    			mount_component(login, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(login.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(login.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(login, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_4.name,
    		type: "slot",
    		source: "(23:8) <Route path=\\\"/\\\">",
    		ctx
    	});

    	return block;
    }

    // (24:8) <Route path="register">
    function create_default_slot_3(ctx) {
    	let register;
    	let current;
    	register = new Register({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(register.$$.fragment);
    		},
    		l: function claim(nodes) {
    			claim_component(register.$$.fragment, nodes);
    		},
    		m: function mount(target, anchor) {
    			mount_component(register, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(register.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(register.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(register, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_3.name,
    		type: "slot",
    		source: "(24:8) <Route path=\\\"register\\\">",
    		ctx
    	});

    	return block;
    }

    // (25:8) <Route path="choice">
    function create_default_slot_2(ctx) {
    	let choice;
    	let current;
    	choice = new Choice({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(choice.$$.fragment);
    		},
    		l: function claim(nodes) {
    			claim_component(choice.$$.fragment, nodes);
    		},
    		m: function mount(target, anchor) {
    			mount_component(choice, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(choice.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(choice.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(choice, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_2.name,
    		type: "slot",
    		source: "(25:8) <Route path=\\\"choice\\\">",
    		ctx
    	});

    	return block;
    }

    // (26:8) <Route>
    function create_default_slot_1(ctx) {
    	let board;
    	let current;
    	board = new Board({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(board.$$.fragment);
    		},
    		l: function claim(nodes) {
    			claim_component(board.$$.fragment, nodes);
    		},
    		m: function mount(target, anchor) {
    			mount_component(board, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(board.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(board.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(board, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_1.name,
    		type: "slot",
    		source: "(26:8) <Route>",
    		ctx
    	});

    	return block;
    }

    // (21:0) <Router url="{url}">
    function create_default_slot(ctx) {
    	let div;
    	let route0;
    	let t0;
    	let route1;
    	let t1;
    	let route2;
    	let t2;
    	let route3;
    	let current;

    	route0 = new Route({
    			props: {
    				path: "/",
    				$$slots: { default: [create_default_slot_4] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	route1 = new Route({
    			props: {
    				path: "register",
    				$$slots: { default: [create_default_slot_3] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	route2 = new Route({
    			props: {
    				path: "choice",
    				$$slots: { default: [create_default_slot_2] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	route3 = new Route({
    			props: {
    				$$slots: { default: [create_default_slot_1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(route0.$$.fragment);
    			t0 = space();
    			create_component(route1.$$.fragment);
    			t1 = space();
    			create_component(route2.$$.fragment);
    			t2 = space();
    			create_component(route3.$$.fragment);
    			this.h();
    		},
    		l: function claim(nodes) {
    			div = claim_element(nodes, "DIV", {});
    			var div_nodes = children(div);
    			claim_component(route0.$$.fragment, div_nodes);
    			t0 = claim_space(div_nodes);
    			claim_component(route1.$$.fragment, div_nodes);
    			t1 = claim_space(div_nodes);
    			claim_component(route2.$$.fragment, div_nodes);
    			t2 = claim_space(div_nodes);
    			claim_component(route3.$$.fragment, div_nodes);
    			div_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			add_location(div, file, 21, 4, 692);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, div, anchor);
    			mount_component(route0, div, null);
    			append_hydration_dev(div, t0);
    			mount_component(route1, div, null);
    			append_hydration_dev(div, t1);
    			mount_component(route2, div, null);
    			append_hydration_dev(div, t2);
    			mount_component(route3, div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const route0_changes = {};

    			if (dirty & /*$$scope*/ 8) {
    				route0_changes.$$scope = { dirty, ctx };
    			}

    			route0.$set(route0_changes);
    			const route1_changes = {};

    			if (dirty & /*$$scope*/ 8) {
    				route1_changes.$$scope = { dirty, ctx };
    			}

    			route1.$set(route1_changes);
    			const route2_changes = {};

    			if (dirty & /*$$scope*/ 8) {
    				route2_changes.$$scope = { dirty, ctx };
    			}

    			route2.$set(route2_changes);
    			const route3_changes = {};

    			if (dirty & /*$$scope*/ 8) {
    				route3_changes.$$scope = { dirty, ctx };
    			}

    			route3.$set(route3_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(route0.$$.fragment, local);
    			transition_in(route1.$$.fragment, local);
    			transition_in(route2.$$.fragment, local);
    			transition_in(route3.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(route0.$$.fragment, local);
    			transition_out(route1.$$.fragment, local);
    			transition_out(route2.$$.fragment, local);
    			transition_out(route3.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(route0);
    			destroy_component(route1);
    			destroy_component(route2);
    			destroy_component(route3);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot.name,
    		type: "slot",
    		source: "(21:0) <Router url=\\\"{url}\\\">",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let toast;
    	let t;
    	let router;
    	let current;
    	toast = new Toast({ $$inline: true });

    	router = new Router({
    			props: {
    				url: /*url*/ ctx[0],
    				$$slots: { default: [create_default_slot] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(toast.$$.fragment);
    			t = space();
    			create_component(router.$$.fragment);
    		},
    		l: function claim(nodes) {
    			claim_component(toast.$$.fragment, nodes);
    			t = claim_space(nodes);
    			claim_component(router.$$.fragment, nodes);
    		},
    		m: function mount(target, anchor) {
    			mount_component(toast, target, anchor);
    			insert_hydration_dev(target, t, anchor);
    			mount_component(router, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const router_changes = {};
    			if (dirty & /*url*/ 1) router_changes.url = /*url*/ ctx[0];

    			if (dirty & /*$$scope*/ 8) {
    				router_changes.$$scope = { dirty, ctx };
    			}

    			router.$set(router_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(toast.$$.fragment, local);
    			transition_in(router.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(toast.$$.fragment, local);
    			transition_out(router.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(toast, detaching);
    			if (detaching) detach_dev(t);
    			destroy_component(router, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let $room;
    	validate_store(room, 'room');
    	component_subscribe($$self, room, $$value => $$invalidate(1, $room = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('App', slots, []);
    	let { url = "" } = $$props;
    	let id = parseInt(location.href.split("/").pop());
    	const writable_props = ['url'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('url' in $$props) $$invalidate(0, url = $$props.url);
    	};

    	$$self.$capture_state = () => ({
    		Login,
    		Register,
    		Board,
    		Toast,
    		Choice,
    		room,
    		Router,
    		Route,
    		navigate,
    		url,
    		id,
    		$room
    	});

    	$$self.$inject_state = $$props => {
    		if ('url' in $$props) $$invalidate(0, url = $$props.url);
    		if ('id' in $$props) $$invalidate(2, id = $$props.id);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$room*/ 2) {
    			$room && $room.id
    			? navigate($room.id, { replace: true })
    			: navigate(location.href.split("/").pop(), { replace: true });
    		}
    	};

    	!Number.isNaN(id) && room.join(id);
    	return [url, $room];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, { url: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment.name
    		});
    	}

    	get url() {
    		throw new Error("<App>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set url(value) {
    		throw new Error("<App>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const app = new App({
    	target: document.body,
    	hydrate: true
    });

    return app;

})();
//# sourceMappingURL=bundle.js.map
