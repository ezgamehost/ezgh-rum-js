function n(t){let o=0;for(const e of t)o+=e.price*e.qty;return o}const r=[{price:3,qty:2},{price:5,qty:1}];function c(t){if(t.length===0)throw new TypeError("cart has no items");return n(t)}console.log("total",c(r));
//# sourceMappingURL=index-4f2a.js.map
