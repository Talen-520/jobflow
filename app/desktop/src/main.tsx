import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { AssistantWindow } from "./AssistantWindow";
import "./index.css";

const searchParams = new URLSearchParams(window.location.search);
const RootComponent = searchParams.get("view") === "assistant" ? AssistantWindow : App;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>,
);
