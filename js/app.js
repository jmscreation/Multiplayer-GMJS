(function(msgpack){

'use strict';

var require = (function(_modules){
	function ModuleError(msg,type) {
		var t = this;
		if(!(t instanceof ModuleError))
			Object.setPrototypeOf(t={},ModuleError.prototype);

		var err = Error.call(t,msg);
		t.message = msg;
		t.name = "ModuleError";
		t.stack = err.stack;
		t.type = type;
		return t;
	}
	Object.setPrototypeOf(ModuleError.prototype,Error.prototype); // inherit

	var modules = {}, moduleFuncs = {};

	function require(name) {
		if(!(name in modules))
			throw new ModuleError("Module: Trying to require non-existent module: "+name,'MODULENOTFOUND');

		if(typeof modules[name] === "function") {
			var exec = modules[name],
				mod = {id:name, loaded:false, exports:{}};
			modules[name] = {mod};
			try {
				if(exec(require,mod) !== undefined)
					throw new ModuleError("Module: return value from module "+name+" should be 'undefined'",'MODULERETURN');
				mod.loaded = true;
			} catch(e) {
				delete modules[name].mod;
				modules[name].err = e;
			}
		}
		if(modules[name].hasOwnProperty('err'))
			throw modules[name].err;
		return modules[name].mod.exports;
	}

	if("reflect" in modules)
		throw new ModuleError("Cannot redefine core 'reflect' module",'MODULEREDECLARATION');

	// extract modules from '_modules'
	for(let m in _modules) {
		if(typeof _modules[m] === "function")
			moduleFuncs[m] = modules[m] = _modules[m];
		else
			modules[m] = {mod: _modules[m]};
	}

	modules['reflect'] = function(require,module){
		var reflect = {
			ModuleError,
			modules: moduleFuncs,
			register: function(name,cb) {
				if(typeof name === "object") {
					for(let mod in name)
						reflect.register(mod,name[mod]);
					return reflect;
				}
				if(name in modules)
					throw new ModuleError("Cannot register module with existing name: '"+name+"'",'MODULEREDECLARATION');
				moduleFuncs[name] = modules[name] = cb;
				return reflect;
			},
			export: function(name,exp) {
				if(typeof name === "object") {
					for(let mod in name)
						reflect.export(mod,name[mod]);
					return reflect;
				}
				if(name in modules)
					throw new ModuleError("Cannot register export with existing module name: '"+name+"'",'MODULEREDECLARATION');
				modules[name] = {mod:{exports:exp}};
				return reflect;
			},
		};
		module.exports = reflect;
	};
	return require;
})({
	msgpack:{exports:window.msgpack},

	// core
	'oop'(require,module){
		module.exports = {
			inherit: function(child,parent) {
				child.prototype = Object.create(parent.prototype);
				child.prototype.constructor = child;
			},
			class: function(ths,cls) {
				if(!(ths instanceof cls)) throw new Error("Bad instantiation of object "+cls.name);
				return ths;
			},
			interface: function(ths,itf,win=window) {
				if(ths instanceof itf) throw new Error("Illegal instantiation of interface "+itf.name);
				if(ths === win) throw new Error("Bad implementation of interface "+itf.name);
				return ths;
			},
			package: function() {
				var pkg = new WeakMap();

				return function(obj,def={}) {
					if(!pkg.has(obj))
						pkg.set(obj,def);
					return pkg.get(obj);
				};
			},
			protect: function(ths,obj,prop="_protected") {
				Object.defineProperty(ths,prop,{
					get() {
						delete ths[prop];
						var _obj = obj;
						obj = undefined;
						return _obj;
					},
					configurable: true,
					enumerable: false,
				});
			},
		};
	},
	'hookable'(require,module){
		module.exports = Hookable;

		function Hookable(hooklist) {
			// ES5 v2.2.2
			var t=this;

			function hookWarning(hook,action) {
				console.warn("Hookable: Failed to "+action+" hook '"+hook+"' on object with non-arbitrary hooks; candidates are '"+hooklist+"'");
			}

			var arbitrary = false, hooks = {};

			if(typeof hooklist === "string") {
				var hookarray = hooklist.split(" ");
				for(var hk=0;hk<hookarray.length;hk++)
					hooks[hookarray[hk]] = [];
				hooks["*"] = [];
			} else if(hooklist === Hookable.ARBITRARY) {
				arbitrary = true;
			} else
				throw new Error("Failed to initiate Hookable on object; invalid hooklist");

			t.on = function(hook,callback) {
				if(typeof hook == "object" && arguments.length == 1) {
					for(var hk in hook)
						t.on(hk, hook[hk]);
					return t;
				}

				var _cb = Array.isArray(callback) ? callback : [callback]; callback = [];
				for(var i=0;i<_cb.length;i++) if(typeof _cb[i] == "function") callback.push(_cb[i]);

				var _hk = hook.replace(/^\s*|\s*$/g,"").replace(/\s+/g," ").split(" ");
				if(arbitrary)
					hook = _hk;
				else {
					hook = [];
					for(var i=0;i<_hk.length;i++) if(_hk[i] in hooks) hook.push(_hk[i]); else hookWarning(_hk[i],"attach");
				}

				for(var i=0;i<hook.length;i++) {
					var hk = hook[i];
					hooks[hk] = hooks[hk] || [];
					for(var cb=0;cb<callback.length;cb++)
						if(hooks[hk].indexOf(callback[cb]) == -1)
							hooks[hk].push(callback[cb]);
				}

				return t;
			}

			t.off = function(hook,callback) {
				if(typeof hook == "object" && arguments.length == 1) {
					for(var hk in hook)
						t.off(hk, hook[hk]);
					return t;
				}

				callback = Array.isArray(callback) ? callback : [callback];
				var _hk = hook.replace(/^\s*|\s*$/g,"").replace(/\s+/g," ").split(" "); hook = [];
				for(var i=0;i<_hk.length;i++) {
					if(_hk[i] in hooks)
						hook.push(_hk[i]);
					else if(!arbitrary)
						hookWarning(_hk[i],"detach");
				}

				var pos;
				for(var i=0;i<hook.length;i++) {
					var hk = hook[i];
					for(var cb=0;cb<callback.length;cb++) {
						pos = hooks[hk].indexOf(callback[cb]);
						if(pos!==-1) hooks[hk].splice(pos,1);
					}
				}

				return t;
			}

			t.offAll = function(hook) {
				var _hk = hook.split(" "); hook = [];
				for(var i=0;i<_hk.length;i++) {
					if(_hk[i] in hooks)
						hook.push(_hk[i]);
					else if(!arbitrary)
						hookWarning(_hk[i],"detach all from");
				}

				if(arbitrary) {
					for(var i=0;i<hook.length;i++) delete hooks[hook[i]];
				} else {
					for(var i=0;i<hook.length;i++) hooks[hook[i]] = [];
				}

				return t;
			}

			t.has = function(hook) {
				return hook in hooks && hooks[hook].length;
			}

			t.kill = function() {
				if(arbitrary)
					for(var i in hooks) delete hooks[i];
				else
					for(var i in hooks) hooks[i] = [];
				return t;
			}

			t._trigger = function(hook,evt) {
				var list, e;
				evt = evt || {};
				hook = hook.split(" ");
				for(var i=0;i<hook.length;i++) {
					var hk = hook[i];

					if(!(hk in hooks) && !arbitrary) {
						hookWarning(hk,"trigger");
						continue;
					}

					if(hooks[hk] || hooks["*"]) {
						e = {};
						for(var p in evt) e[p] = evt[p];
						e.event = hk; // override potential event properties in case of custom bubbling
					}

					if(hooks[hk]) {
						list = hooks[hk].slice();
						for(var cb=0;cb<list.length;cb++)
							list[cb].call(this,e);
					}

					if(hooks["*"]) {
						list = hooks["*"].slice();
						for(var cb=0;cb<list.length;cb++)
							list[cb].call(this,e);
					}
				}

				return t;
			}
		}
		Hookable.extend = function(hooklist) {
			var t=this;

			if(typeof hooklist === Hookable.ARBITRARY)
				throw new Error("Cannot extend in arbitrary mode since all child hooks would override parent hooks."
					+ " Use Hookable directly instead to accomplish this.");

			var _on = t.on, _off = t.off, _offAll = t.offAll, _has = t.has, _kill = t.kill,
				allowed = {},
				allowedList = hooklist.split(" ");

			for(var i=0;i<allowedList.length;i++)
				allowed[allowedList[i]] = true;

			Hookable.call(t,hooklist);

			var on = t.on, off = t.off, offAll = t.offAll, has = t.has, kill = t.kill;

			function separate(hook) {
				var parent = [], child = [];

				for(var i=0;i<hook.length;i++) {
					if(hook[i] in allowed)
						child.push(hook[i]);
					else
						parent.push(hook[i]);
					if(hook[i] === "*")
						child.push(hook[i]);
				}
				return {parent: parent.join(" "), child: child.join(" ")};
			}

			function separateMap(hook,callback) {
				var ret = {};

				if(typeof hook == "object" && arguments.length == 1) {
					for(var hk in hook) {
						var obj = separate(hk.replace(/^\s*|\s*$/g,"").replace(/\s+/g," ").split(" "));

						if(obj.child) {
							ret.child = ret.child || {};
							while(obj.child in ret.child) obj.child += " ";
							ret.child[obj.child] = hook[hk];
						}
						if(obj.parent) {
							ret.parent = ret.parent || {};
							while(obj.parent in ret.parent) obj.parent += " ";
							ret.parent[obj.parent] = hook[hk];
						}
					}
				} else {
					var obj = separate(hook.replace(/^\s*|\s*$/g,"").replace(/\s+/g," ").split(" "));

					if(obj.child) {
						ret.child = {};
						ret.child[obj.child] = callback;
					}
					if(obj.parent) {
						ret.parent = {};
						ret.parent[obj.parent] = callback;
					}
				}
				return ret;
			}

			t.on = function(hook,callback) {
				hook = separateMap.apply(null,arguments);

				if(hook.child) on(hook.child);
				if(hook.parent) _on(hook.parent);
				return t;
			}
			t.off = function(hook,callback) {
				hook = separateMap.apply(null,arguments);

				if(hook.child) off(hook.child);
				if(hook.parent) _off(hook.parent);
				return t;
			}
			t.offAll = function(hook) {
				hook = separate(hook);

				if(hook.child) offAll(hook.child);
				if(hook.parent) _offAll(hook.parent);
				return t;
			}
			t.has = function(hook) {
				return _has(hook) || has(hook);
			}
			t.kill = function() {
				kill(); _kill();
				return t;
			}
		}
		Hookable.ARBITRARY = {};
	},

	// server api
	'server.error'(require,module){
		var oop = require('oop');

		module.exports = ServerError;

		function ServerError(message) {
			var t = oop.class(this,ServerError);

			var err = Error.call(t,message);
			t.message = message;
			t.name = "ServerError";
			t.stack = err.stack;
		}
		oop.inherit(ServerError,Error);
	},
	'server.communicator'(require,module){
		var oop = require('oop'),
			ServerError = require('server.error'),
			msgpack = require('msgpack');

		module.exports = Communicator;

		function Communicator({receive,open,close}, {domain=null,port=5050}={}) {
			var t = oop.class(this,Communicator);

			var packer = new msgpack({returnType:"arraybuffer"}),
				opened = false, closed = false;

			domain = domain || location.hostname;
			port = port | 0;
			var protocol = location.protocol.replace(/^http/,'ws');

			var ws = new WebSocket(protocol+"//"+domain+':'+port);
			ws.addEventListener('open',evt=>{
				opened = true;
				open();
			});
			ws.addEventListener('close',evt=>{
				closed = true;
				for(var id in pending)
					pending[id][1](new ServerError("Connection closed before response"));
				close();
			});
			ws.addEventListener('message',evt=>{
				var data = packer.decode(evt.data);
				
				if(!data || typeof data !== "object") {
					console.warn("Failed to receive data from server");
					return;
				}

				if("msgid" in data) {
					if(pending.hasOwnProperty(data.msgid)) {
						let res = pending[data.msgid];
						delete pending[data.msgid];
						delete data.msgid;
						if("error" in data)
							res[1](new ServerError(data.error));
						else
							res[0](data);
					} else
						console.warn("Failed to receive response to unsent message with id "+data.msgid);
				} else
					receive(data);
			});

			var nextID = (ctr => () => (ctr = ctr+1 >>> 0))(-1),
				pending = {};

			function send(msg) {
				return new Promise((resolve,reject)=>{
					if(!opened) reject(new ServerError("Connection is not open"));
					if(closed) reject(new ServerError("Connection is closed"));

					var msgid = nextID();
					pending[msgid] = [resolve,reject];
					ws.send(packer.encode({...msg, msgid}));
				});
			}

			function disconnect() {
				ws.close();
			}

			oop.protect(t,{send,disconnect});
		}
	},
	'server.groupcommunicator'(require,module){
		var oop = require('oop'),
			Hookable = require('hookable'),
			Communicator = require('server.communicator');

		module.exports = GroupCommunicator;

		/*
			sent:
				*			group		get current group info
							{} -> {code:string, id:int|null, owner:int|null isOwner:boolean}
				*			keepalive	keepalive ping
							{} -> {}
				nogroup		create		create new group
							{profile:object, max?:int} -> {code:string, id:int}
				nogroup		join		join group by code
							{code:string, profile:object} -> {id:int, users:{[int]:object}, owner:int}
				group		broadcast	send message to all
							{data:*} -> {}
				group		target		send message to specific
							{data:*, id:int} -> {}
				group		list		list users
							{id:int, users:{[int]:object}, owner:int}
				group		leave		leave group
							{} -> {}
				owner		kick		kick user
							{id:int} -> {}
				owner		changeowner	give ownership to user
							{id:int} -> {}
				owner		max			change max user limit on group
							{max:int} -> {max:int}
				owner		close		close group
							{} -> {}

			received:
				group		joined		another user joined the group
							-> {id:int, profile:object}
				group		broadcast	receive broadcasted message
							-> {from:int, data:*}
				group		target		receive targeting message
							-> {from:int, data:*}
				group		left		user left group/was kicked/lost connection
							-> {id:int, reason:string}
				group		kicked		you were kicked from group
							-> {}
				group		closed		group closed and kicked everyone
							-> {}
				group		owner		the group owner changed
							-> {from:int, to:int}
				group		newowner	you received ownership of the group
							-> {from:int}
				group		newmax		a new maximum of users on the group has been set
		*/

		function GroupCommunicator(params) {
			var t = oop.class(this,GroupCommunicator);
			Communicator.call(t, {receive,open,close}, params);
			Hookable.call(t,'message connect disconnect joined left leave owner max');

			var {send,disconnect} = t._protected,
				trigger = t._trigger,
				opened = false,
				closed = false;

			var users = new Map(),
				me = null,
				group = null,
				owner = null,
				max = null,
				destroyGroup = null;

			function closeGroup() {
				if(destroyGroup) destroyGroup();
				me = group = owner = max = null;
				users.clear();
			}

			function Group(code) {
				var t = oop.class(this,Group);

				group = t;
				var closed = false;
				destroyGroup = ()=>{closed = true};

				function ifClosed() {
					if(closed) throw new Error("Cannot call functions on closed group");
				}

				t.isClosed = function() {
					return closed;
				}
				t.code = function() {
					return code;
				}
				t.owner = function() {
					ifClosed();
					return owner;
				}
				t.isMine = function() {
					ifClosed();
					return owner === me;
				}
				t.leave = async function() {
					ifClosed();
					await send({cmd:'leave'});

					closeGroup();

					trigger('leave',{
						type: 'leave',
					});
				}
				t.users = function() {
					ifClosed();
					return [...users.values()];
				}
				t.max = function() {
					ifClosed();
					return max;
				}

				t.me = function() {
					ifClosed();
					return me;
				}
				t.send = async function(data) {
					ifClosed();
					await send({cmd:'broadcast', data});
				}
				t.setMax = async function(newmax) {
					ifClosed();
					newmax = await send({cmd:'max', max:newmax});
					max = newmax.max;
					trigger('max',{
						max,
					});
				}
				t.isFull = function() {
					ifClosed();
					return users.size >= max;
				}
			}

			function User(id,profile) {
				var t = oop.class(this,User);

				if(users.has(id)) throw new Error("Failed to recreate existing user");

				users.set(id,t);
				Object.seal(profile);

				var myGroup = group;

				function ifClosed() {
					if(users.get(id) !== t)
						throw new Error("Cannot call functions on a user that is dropped");
				}

				t.id = function() {
					return id;
				}
				t.isMe = function() {
					return me === t;
				}
				t.profile = function() {
					ifClosed();
					return profile;
				}

				t.isClosed = function() {
					return users.get(id) !== t;
				}
				t.group = function() {
					return myGroup;
				}
				t.send = async function(data) {
					ifClosed();
					await send({cmd:'target', id, data});
				}
				t.kick = async function() {
					ifClosed();
					await send({cmd:'kick', id});
					users.delete(id);

					trigger('left',{
						type: 'kicked',
						user: t,
					});
				}
				t.own = async function() {
					ifClosed();
					await send({cmd:'own', id});
					var from = owner;
					owner = t;

					trigger('owner',{
						type: 'owner',
						from,
						to: t,
					});
				}
			}

			function receive(msg) {
				switch(msg.cmd) {
					case 'joined':
						trigger('joined',{
							user: new User(msg.id, msg.profile),
						});
						break;
					case 'broadcast':
					case 'target':
						trigger('message',{
							type: msg.cmd,
							from: users.get(msg.from),
							data: msg.data,
						});
						break;
					case 'left':
						var user = users.get(msg.id);
						users.delete(msg.id);

						trigger('left',{
							type: msg.reason,
							user,
						});
						break;
					case 'kicked':
					case 'closed':
						closeGroup();

						trigger('leave',{
							type: msg.cmd,
						});
						break;
					case 'owner':
					case 'newowner':
						owner = msg.cmd==='newowner' ? me : users.get(msg.to);

						trigger('owner',{
							type: msg.cmd,
							from: users.get(msg.from),
							to: owner,
						});
						break;
					case 'newmax':
						max = msg.max;

						trigger('max',{
							max,
						});
						break;
				}
			}
			function open() {
				opened = true;
				living = keepAlive();
				trigger('connect');
			}
			function close() {
				closed = true;
				closeGroup();
				window.clearInterval(living);
				trigger('disconnect');
			}

			var profile = {};
			t.profile = function(obj) {
				if(!arguments.length) return profile;
				if(group) throw new Error("Cannot update profile while part of group");
				profile = {...obj};
				return t;
			}

			t.create = async function(maxusers) {
				var grp = await send({cmd:'create', max:maxusers, profile});
				group = new Group(grp.code);
				max = grp.max;
				owner = me = new User(grp.id, profile);
				return group;
			}
			t.join = async function(code) {
				var grp = await send({cmd:'join', code, profile});
				group = new Group(code);
				max = grp.max;
				me = new User(grp.id, profile);
				for(var id in grp.users)
					if(+id !== me.id())
						new User(+id, grp.users[id]);
				owner = users.get(grp.owner);
				return group;
			}
			t.group = function() {
				return group;
			}

			t.isConnected = function() {
				return opened && !closed;
			}
			t.disconnect = function() {
				disconnect();
				return t;
			}

			var living = null;
			function keepAlive() {
				return window.setInterval(function(){
					if(opened && !closed) send({cmd:'keepalive'});
				},10000);
			}
		}
		oop.inherit(GroupCommunicator,Communicator);
	},

});

//window.addEventListener('load',()=>require('index'));
window.require = require;

})();