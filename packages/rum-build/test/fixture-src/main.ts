// Plain JavaScript in a .ts file, so every bundler parses it without a TypeScript loader.
export function explode(item = { price: 0 }) {
  return item.price * 2
}
document.body.dataset.total = String(explode({ price: 4 }))
document.body.addEventListener("click", () => {
  void import("./lazy.ts").then(m => m.later())
})
