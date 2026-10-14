;!function(){try{var g="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{},s=(new g.Error).stack;s&&((g._ezghDebugIds=g._ezghDebugIds||{})[s]="2ebb3c62-0e63-48d8-a4a1-cdc17e31b829")}catch(e){}}();function n(t){let o=0;for(const e of t)o+=e.price*e.qty;return o}const r=[{price:3,qty:2},{price:5,qty:1}];function c(t){if(t.length===0)throw new TypeError("cart has no items");return n(t)}console.log("total",c(r));
//# debugId=2ebb3c62-0e63-48d8-a4a1-cdc17e31b829
//# sourceMappingURL=index-4f2a.js.map
