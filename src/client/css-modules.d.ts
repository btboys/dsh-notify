/**
 * Ambient declaration for CSS Modules under src/client. tsdown's lightningcss
 * plugin compiles `x.module.css` to a hashed class map; the browser bundle
 * inlines the stylesheet at runtime, so we only type the named-export surface
 * (`default` holds the class map).
 */

declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}
