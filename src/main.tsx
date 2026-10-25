import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { initTheme } from "./lib/theme";
import "./index.css";

// 默认跟随系统主题，也可以在顶栏固定浅色或深色。这类工具会被长时间挂着，深色不是锦上添花。
initTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
