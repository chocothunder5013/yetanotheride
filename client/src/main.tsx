import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './Home';
import Editor from './App'; // We treat App.tsx as the Editor component
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/doc/:docId" element={<Editor />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)