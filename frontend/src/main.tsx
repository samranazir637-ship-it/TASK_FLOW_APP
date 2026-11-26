import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { AppProviders } from "@/app/providers";
import { router } from "@/app/router";
import { Loading } from "@/components/ui/primitives";
import "@/styles/tokens.css";

function PageLoading() {
  return (
    <main className="content-wrap" aria-busy="true">
      <h1 className="sr-only">Loading TaskFlow</h1>
      <Loading label="Loading page" />
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProviders>
      <Suspense fallback={<PageLoading />}>
        <RouterProvider router={router} />
      </Suspense>
    </AppProviders>
  </React.StrictMode>,
);
