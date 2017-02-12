import { SyncNode, SyncData, SyncNodeEventEmitter, SyncNodeSocket } from './SyncNode';

type Partial<T> = {
    [P in keyof T]?: T[P];
}
type CSSStyleDeclarationPartial = Partial<CSSStyleDeclaration>; // To get code completion for style definitions below, make partial to specify only a subset

export interface ElementSpec {
    tag?: string;
    innerHTML?: string;
    style?: CSSStyleDeclarationPartial;
    events?: { [key: string]: (...args: any[]) => void }
}

export interface SyncViewOptions {
	tag?: keyof ElementTagNameMap;
	style?: CSSStyleDeclarationPartial;
}

export class SyncView<T extends SyncData> extends SyncNodeEventEmitter {
	options: SyncViewOptions;
	el: HTMLElement;
	data: T;
	__currentDataVersion: string | null;

	constructor(options?: SyncViewOptions) {
		super();
		this.options = options || {};
		this.el = document.createElement(this.options.tag || 'div');
		this.style(this.options.style || {});
	}
	hasDataChanged(newData: T): boolean {
		if(!newData) return true;
		if(this.__currentDataVersion && newData.version) {
			return this.__currentDataVersion !== newData.version;
		}
		return true;
	}
	append<R extends HTMLElement>(spec: ElementSpec = {}): R {
	    let el = document.createElement(spec.tag || "div") as R;
	    el.innerHTML = spec.innerHTML || "";
	    if (spec.style) {
	        Object.keys(spec.style).forEach((key: string) => { (el.style as any)[key] = (spec.style as any)[key]; });
	    }
	    if (spec.events) {
	        Object.keys(spec.events).forEach((key: string) => {
	            el.addEventListener(key, (spec.events as any)[key]);
	        });
	    }
	    this.el.appendChild(el);
	    return el;
	}
	style(s: any): void {
	    Object.keys(s).forEach((key: string) => { (this.el.style as any)[key] = (s as any)[key]; });
	}
    appendView<R extends SyncView<SyncData>>(view: R): R {
		view.init();
        this.el.appendChild(view.el);
        return view;
    }
	init() {
	}
	update(data: T, force?: boolean) {
		if(force || this.hasDataChanged(data)) {
			this.__currentDataVersion = data ? data.version : null;
			this.data = data;
			this.render();
		}
	}
	render() {
	}
}



export class SyncUtils {
	static getProperty(obj: any, path: string): any {
		if(!path) return obj;
		return SyncUtils.getPropertyHelper(obj, path.split('.'));
	}

	static getPropertyHelper(obj: any, split: any[]): any {
		if(split.length === 1) return obj[split[0]];
		if(obj == null) return null;
		return SyncUtils.getPropertyHelper(obj[split[0]], split.slice(1, split.length));
	}
	static mergeMap(destination: any, source: any) {
		destination = destination || {};
		Object.keys(source || {}).forEach((key) => {
			destination[key] = source[key];
		});
		return destination;
	}

	static normalize(str: string) {
		return (str || '').trim().toLowerCase();
	}

	static toMap(arr: any[], keyValFunc?: (obj: any) => string) {
		keyValFunc = keyValFunc || ((obj) => { return obj.key });
		if(typeof arr !== 'array') return arr;
		let result = {};
		let curr;
		for(let i = 0; i < arr.length; i++) {
			curr = arr[i];	
			(result as any)[keyValFunc(curr)] = curr;	
		}
		return result;
	}

	static sortMap(obj: any, sortField: string, reverse?: boolean, keyValFunc?: (obj: any) => string) {
		return SyncUtils.toMap(SyncUtils.toArray(obj, sortField, reverse), keyValFunc);
	}

	static toArray(obj: any, sortField?: string, reverse?: boolean) {
		let result: any[];
		if(Array.isArray(obj)) {
			result = obj.slice();
		} else {
			result = [];
			if(!obj) return result;
			Object.keys(obj).forEach((key) => {
				if (key !== 'version' && key !== 'lastModified' && key !== 'key') {
					result.push(obj[key]);
				}
			});
		}

		if(sortField) {
			let getSortValue: (obj: any) => any;
			if(typeof sortField === 'function') getSortValue = sortField;
			else getSortValue = (obj: any) => { return SyncUtils.getProperty(obj, sortField); }
			result.sort(function (a, b) {
				let a1 = getSortValue(a);
				let b1 = getSortValue(b);
				if(typeof a1 === 'string') a1 = a1.toLowerCase();
				if(typeof b1 === 'string') b1 = b1.toLowerCase();
				if (a1 < b1)
					return reverse ? 1 : -1;
				if (a1 > b1)
					return reverse ? -1 : 1;
				return 0;
			});
		}
		return result;
	}

	static forEach(obj: any, func: (val: any) => any) {
		if(typeof obj !== 'array') {
			obj = SyncUtils.toArray(obj);
		}
		obj.forEach((val: any) => func(val));
	}
	
	static getByKey(obj: any, key: string) {
		if(Array.isArray(obj)) {
			for(let i = 0; i < obj.length; i++) {
				if(obj[i].key === key) return obj[i];
			}
		} else {
			return obj[key]; 
		}
	}

	static param(variable: string) {
		let query = window.location.search.substring(1);
		let vars = query.split("&");
		for (let i = 0; i < vars.length; i++) {
			let pair = vars[i].split("=");
			if (pair[0] == variable) {
				return pair[1];
			}
		}
		return (false);
	}

	static getHash() {
		let hash = window.location.hash;
		hash = SyncUtils.normalize(hash);
		return hash.length > 0 ? hash.substr(1) : '';
	}

	static group(arr: any[], prop: string, groupVals: any[]) {
		let groups: any = {};

		if(typeof groupVals === 'array') {
			groupVals.forEach((groupVal) => {
				groups[groupVal] = { key: groupVal };
			});
		}


		if(!Array.isArray(arr)) arr = SyncUtils.toArray(arr);

		arr.forEach(function (item) {
			let val;
			if(typeof prop === 'function') {
				val = prop(item);
			} else {
				val = item[prop];
			}

			if(!groups[val]) groups[val] = { key: val };
			groups[val][item.key] = item;
		});

		return groups;
	}

	static filterMap(map: any, filterFn: (val: any) => boolean) {
		let result: any = {};
		map = map || {};
		Object.keys(map).forEach(key => {
			if(key !== 'version' && key !== 'key' && key !== 'lastModified' && filterFn(map[key])) {
				result[key] = map[key];
			}
		});
		return result;
	}

	static isEmptyObject(obj: any) {
		return Object.keys(obj).length === 0;
	}
}

export interface SyncListOptions extends SyncViewOptions {
	sortField?: string;
	sortReversed?: boolean;
	item: typeof SyncView;
}
export class SyncList extends SyncView<SyncData> {
    views: { [key: string]: SyncView<SyncData> };
    item: typeof SyncView;
	options: SyncListOptions;
    constructor(options: SyncListOptions) {
        super(options);
        this.views = {};
    }
    render() {
        var data = this.data || {};
        var itemsArr = SyncUtils.toArray(data, this.options.sortField, this.options.sortReversed);
        Object.keys(this.views).forEach((key) => {
            let view: SyncView<SyncData> = this.views[key];
            if (!SyncUtils.getByKey(data, view.data.key)) {
                this.el.removeChild(view.el);
                delete this.views[view.data.key];
                this.emit('removedView', view);
            }
        });
        let previous: SyncView<SyncData>;
        itemsArr.forEach((item: SyncData) => {
            var view = this.views[item.key];
            if (!view) {
                //let toInit: SyncView.SyncNodeView<SyncNode.SyncData>[] = [];
                var options = {};
                this.emit('addingViewOptions', options);
                //view = this.svml.buildComponent(this.options.ctor || this.options.tag, options, toInit);
                view = new this.options.item(options);
                //toInit.forEach((v) => { v.init(); });
                this.views[item.key] = view;
                this.emit('viewAdded', view);
            }
            // Attempt to preserve order:
            this.el.insertBefore(view.el, previous ? previous.el.nextSibling : this.el.firstChild);
            view.update(item);
            previous = view;
        });
    }
}


export class SyncApp<D extends SyncData> {
    mainView: SyncView<SyncData>;
    constructor(main: SyncView<SyncData>) {
        this.mainView = main;
    }
    start() {
        window.addEventListener('load', () => {
            console.log('loaded');
            document.body.appendChild(this.mainView.el);

            var sync = new SyncNodeSocket('/data', {});
            sync.on('updated', (data: D) => {
                console.log('updated', data);
                this.mainView.update(data);
            });
        });


            // for debugging, receive reload signals from server when source files change
        io().on('reload', function () {
            console.log('reload!!!!');
            location.reload();
        });
    }
}
