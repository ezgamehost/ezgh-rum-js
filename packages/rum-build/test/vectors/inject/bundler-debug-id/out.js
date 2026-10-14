;!function(){try{var g="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:{},s=(new g.Error).stack;s&&((g._ezghDebugIds=g._ezghDebugIds||{})[s]="4628b496-b0f1-4cbe-bf99-e7a3382e6b62")}catch(e){}}();function total(cart) {
  let sum = 0;
  for (const item of cart) sum += item.price * item.qty;
  return sum
}

function checkout(cart) {
  if (cart.length === 0) throw new TypeError("cart has no items")
  return total(cart)
}

export { checkout };
//# debugId=4628b496-b0f1-4cbe-bf99-e7a3382e6b62
//# sourceMappingURL=main-7c1d.js.map
