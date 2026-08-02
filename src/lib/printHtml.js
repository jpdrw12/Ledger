// Prints a full standalone HTML document (as produced by report.js) via a
// hidden iframe, so the OS's native print dialog opens with "Save as PDF" /
// "Microsoft Print to PDF" among the printer choices. This is the standard
// way desktop webview apps hand off to PDF without shipping a PDF renderer —
// window.print()/iframe print() is a native DOM API every Tauri webview
// backend (WebView2, WKWebView, WebKitGTK) already supports.
export function printHtmlDocument(html) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  iframe.onload = () => {
    const win = iframe.contentWindow;
    try {
      // Fires once the print dialog closes (saved, printed, or cancelled) —
      // our cue the iframe is no longer needed.
      win.addEventListener("afterprint", cleanup, { once: true });
      win.focus();
      win.print();
    } catch (e) {
      cleanup();
      throw e;
    }
    // Older WebKitGTK builds don't always fire afterprint — don't let the
    // iframe linger forever if that happens.
    setTimeout(cleanup, 120000);
  };
  iframe.srcdoc = html;
}
