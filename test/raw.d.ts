// Vite's ?raw imports (a file's text), used by tests.
declare module "*?raw" {
  const text: string;
  export default text;
}
