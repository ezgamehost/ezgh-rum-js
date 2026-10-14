/*! cart 1.0.0 | MIT */
"use strict";;!function(){try{var g="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{},s=(new g.Error).stack;s&&((g._ezghDebugIds=g._ezghDebugIds||{})[s]="f060ff1c-99e5-499d-bf4c-33a224c6bc83")}catch(e){}}();(()=>{function o(t){let e=0;for(let r of t)e+=r.price*r.qty;return e}var n=[{price:3,qty:2},{price:5,qty:1}];function c(t){if(t.length===0)throw new TypeError("cart has no items");return o(t)}console.log("total",c(n));})();
//# debugId=f060ff1c-99e5-499d-bf4c-33a224c6bc83
//# sourceMappingURL=app.js.map
