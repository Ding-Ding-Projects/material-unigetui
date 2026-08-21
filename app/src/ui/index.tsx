import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'

const container = document.getElementById('root')
if (container === null) {
  throw new Error('#root is missing from index.html')
}

createRoot(container).render(<App />)
