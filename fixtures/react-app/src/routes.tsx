import { useState } from "react"
import { Link, Outlet, useParams, type RouteObject } from "react-router"
import { consent } from "@ezgh/rum"
import { EzghErrorBoundary } from "@ezgh/rum-react"

const ct = new URLSearchParams(location.search).get("ct") ?? ""

function explode(): number {
  const cart = undefined as unknown as { price: number }
  return cart.price
}

function RenderThrow(): never {
  throw new Error("render exploded")
}

function Home() {
  const [items, setItems] = useState("")
  const [broken, setBroken] = useState(false)
  return (
    <main>
      <h1>Home</h1>
      <nav>
        <Link to={`/users/42?ct=${ct}`}>User 42</Link>
        {" "}
        <Link to={`/users/0b9f5e1c-3d2a-4c1e-9f00-1a2b3c4d5e6f?ct=${ct}`}>User UUID</Link>
      </nav>
      <button
        data-ezgh-action="fetch-items"
        onClick={() => {
          void fetch(`${__FIXTURE_API__}/api/items?ct=${ct}&token=s3cret&coupon=X1`).then(r => r.text()).then(setItems, () => setItems("failed"))
        }}
      >
        Fetch
      </button>
      <button onClick={() => void fetch(`${__FIXTURE_UNTRACED__}/api/other?ct=${ct}`).catch(() => undefined)}>Fetch untraced</button>
      <button onClick={() => {
        explode()
      }}
      >
        Throw
      </button>
      <button onClick={() => {
        for (let i = 0; i < 50; i++) setTimeout(explode, 0)
      }}
      >
        Throw 50
      </button>
      <button onClick={() => consent.grant()}>Grant consent</button>
      <button onClick={() => setBroken(true)}>Render throw</button>
      <input aria-label="secret field" defaultValue="SECRET-INPUT" />
      <button>SECRET-BUTTON-TEXT</button>
      <pre>{items}</pre>
      {broken && <RenderThrow />}
    </main>
  )
}

function User() {
  const { id } = useParams()
  return (
    <main>
      <h1>
        User
        {id}
      </h1>
      <Link to={`/?ct=${ct}`}>Home</Link>
    </main>
  )
}

function Layout() {
  return <EzghErrorBoundary fallback={<p>broken</p>}><Outlet /></EzghErrorBoundary>
}

export const routes: RouteObject[] = [{ path: "/", element: <Layout />, children: [{ index: true, element: <Home /> }, { path: "users/:id", element: <User /> }] }]
