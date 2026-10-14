/*! cart 1.0.0 | MIT */
"use strict";(()=>{function o(t){let e=0;for(let r of t)e+=r.price*r.qty;return e}var n=[{price:3,qty:2},{price:5,qty:1}];function c(t){if(t.length===0)throw new TypeError("cart has no items");return o(t)}console.log("total",c(n));})();
//# sourceMappingURL=app.js.map
