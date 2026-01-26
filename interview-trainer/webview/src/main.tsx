import React from "react";
import ReactDOM from "react-dom/client";
import InterviewTrainer from "./InterviewTrainer";
import "./index.css";

const container = document.getElementById("root");
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <InterviewTrainer />
    </React.StrictMode>,
  );
}
