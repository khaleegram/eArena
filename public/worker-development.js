/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "./worker/index.ts":
/*!*************************!*\
  !*** ./worker/index.ts ***!
  \*************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

eval(__webpack_require__.ts("/// <reference lib=\"webworker\" />\nself.addEventListener('install', ()=>{\n    self.skipWaiting();\n});\nself.addEventListener('activate', (event)=>{\n    event.waitUntil(self.clients.claim());\n});\nself.addEventListener('push', (event)=>{\n    event.waitUntil((async ()=>{\n        var _payload_data;\n        let payload = null;\n        if (event.data) {\n            try {\n                payload = event.data.json();\n            } catch (e) {\n                // If JSON parsing fails, treat it as plain text.\n                payload = {\n                    title: 'eArena',\n                    body: await event.data.text()\n                };\n            }\n        }\n        if (!payload) return;\n        const title = payload.title || 'eArena';\n        const options = {\n            body: payload.body || '',\n            icon: payload.icon || '/icons/android/android-launchericon-192-192.png',\n            badge: '/icons/android/android-launchericon-72-72.png',\n            data: {\n                href: payload.href || ((_payload_data = payload.data) === null || _payload_data === void 0 ? void 0 : _payload_data.href) || '/'\n            }\n        };\n        await self.registration.showNotification(title, options);\n    })());\n});\nself.addEventListener('notificationclick', (event)=>{\n    var _event_notification_data;\n    event.notification.close();\n    const href = ((_event_notification_data = event.notification.data) === null || _event_notification_data === void 0 ? void 0 : _event_notification_data.href) || '/';\n    event.waitUntil((async ()=>{\n        const clientsList = await self.clients.matchAll({\n            type: 'window',\n            includeUncontrolled: true\n        });\n        for (const client of clientsList){\n            // If already open, focus it\n            if ('focus' in client) {\n                // Optional: if you want strict match, compare origins + path properly\n                return client.focus();\n            }\n        }\n        if (self.clients.openWindow) return self.clients.openWindow(href);\n    })());\n});\n\n\n;\n    // Wrapped in an IIFE to avoid polluting the global scope\n    ;\n    (function () {\n        var _a, _b;\n        // Legacy CSS implementations will `eval` browser code in a Node.js context\n        // to extract CSS. For backwards compatibility, we need to check we're in a\n        // browser context before continuing.\n        if (typeof self !== 'undefined' &&\n            // AMP / No-JS mode does not inject these helpers:\n            '$RefreshHelpers$' in self) {\n            // @ts-ignore __webpack_module__ is global\n            var currentExports = module.exports;\n            // @ts-ignore __webpack_module__ is global\n            var prevSignature = (_b = (_a = module.hot.data) === null || _a === void 0 ? void 0 : _a.prevSignature) !== null && _b !== void 0 ? _b : null;\n            // This cannot happen in MainTemplate because the exports mismatch between\n            // templating and execution.\n            self.$RefreshHelpers$.registerExportsForReactRefresh(currentExports, module.id);\n            // A module can be accepted automatically based on its exports, e.g. when\n            // it is a Refresh Boundary.\n            if (self.$RefreshHelpers$.isReactRefreshBoundary(currentExports)) {\n                // Save the previous exports signature on update so we can compare the boundary\n                // signatures. We avoid saving exports themselves since it causes memory leaks (https://github.com/vercel/next.js/pull/53797)\n                module.hot.dispose(function (data) {\n                    data.prevSignature =\n                        self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports);\n                });\n                // Unconditionally accept an update to this module, we'll check if it's\n                // still a Refresh Boundary later.\n                // @ts-ignore importMeta is replaced in the loader\n                /* unsupported import.meta.webpackHot */ undefined.accept();\n                // This field is set when the previous version of this module was a\n                // Refresh Boundary, letting us know we need to check for invalidation or\n                // enqueue an update.\n                if (prevSignature !== null) {\n                    // A boundary can become ineligible if its exports are incompatible\n                    // with the previous exports.\n                    //\n                    // For example, if you add/remove/change exports, we'll want to\n                    // re-execute the importing modules, and force those components to\n                    // re-render. Similarly, if you convert a class component to a\n                    // function, we want to invalidate the boundary.\n                    if (self.$RefreshHelpers$.shouldInvalidateReactRefreshBoundary(prevSignature, self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports))) {\n                        module.hot.invalidate();\n                    }\n                    else {\n                        self.$RefreshHelpers$.scheduleUpdate();\n                    }\n                }\n            }\n            else {\n                // Since we just executed the code for the module, it's possible that the\n                // new exports made it ineligible for being a boundary.\n                // We only care about the case when we were _previously_ a boundary,\n                // because we already accepted this update (accidental side effect).\n                var isNoLongerABoundary = prevSignature !== null;\n                if (isNoLongerABoundary) {\n                    module.hot.invalidate();\n                }\n            }\n        }\n    })();\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiLi93b3JrZXIvaW5kZXgudHMiLCJtYXBwaW5ncyI6IkFBQUEsaUNBQWlDO0FBR2pDQSxLQUFLQyxnQkFBZ0IsQ0FBQyxXQUFXO0lBQy9CRCxLQUFLRSxXQUFXO0FBQ2xCO0FBRUFGLEtBQUtDLGdCQUFnQixDQUFDLFlBQVksQ0FBQ0U7SUFDakNBLE1BQU1DLFNBQVMsQ0FBQ0osS0FBS0ssT0FBTyxDQUFDQyxLQUFLO0FBQ3BDO0FBRUFOLEtBQUtDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQ0U7SUFDN0JBLE1BQU1DLFNBQVMsQ0FBQyxDQUFDO1lBbUJpQkc7UUFsQmhDLElBQUlBLFVBQWU7UUFFbkIsSUFBSUosTUFBTUssSUFBSSxFQUFFO1lBQ2QsSUFBSTtnQkFDRkQsVUFBVUosTUFBTUssSUFBSSxDQUFDQyxJQUFJO1lBQzNCLEVBQUUsVUFBTTtnQkFDTixpREFBaUQ7Z0JBQ2pERixVQUFVO29CQUFFRyxPQUFPO29CQUFVQyxNQUFNLE1BQU1SLE1BQU1LLElBQUksQ0FBQ0ksSUFBSTtnQkFBRztZQUM3RDtRQUNGO1FBRUEsSUFBSSxDQUFDTCxTQUFTO1FBRWQsTUFBTUcsUUFBUUgsUUFBUUcsS0FBSyxJQUFJO1FBQy9CLE1BQU1HLFVBQStCO1lBQ25DRixNQUFNSixRQUFRSSxJQUFJLElBQUk7WUFDdEJHLE1BQU1QLFFBQVFPLElBQUksSUFBSTtZQUN0QkMsT0FBTztZQUNQUCxNQUFNO2dCQUFFUSxNQUFNVCxRQUFRUyxJQUFJLE1BQUlULGdCQUFBQSxRQUFRQyxJQUFJLGNBQVpELG9DQUFBQSxjQUFjUyxJQUFJLEtBQUk7WUFBSTtRQUMxRDtRQUVBLE1BQU1oQixLQUFLaUIsWUFBWSxDQUFDQyxnQkFBZ0IsQ0FBQ1IsT0FBT0c7SUFDbEQ7QUFDRjtBQUVBYixLQUFLQyxnQkFBZ0IsQ0FBQyxxQkFBcUIsQ0FBQ0U7UUFHNUJBO0lBRmRBLE1BQU1nQixZQUFZLENBQUNDLEtBQUs7SUFFeEIsTUFBTUosT0FBTyxFQUFDYiwyQkFBQUEsTUFBTWdCLFlBQVksQ0FBQ1gsSUFBSSxjQUF2QkwsK0NBQUQseUJBQWtDYSxJQUFJLEtBQUk7SUFFdkRiLE1BQU1DLFNBQVMsQ0FBQyxDQUFDO1FBQ2YsTUFBTWlCLGNBQWMsTUFBTXJCLEtBQUtLLE9BQU8sQ0FBQ2lCLFFBQVEsQ0FBQztZQUFFQyxNQUFNO1lBQVVDLHFCQUFxQjtRQUFLO1FBRTVGLEtBQUssTUFBTUMsVUFBVUosWUFBYTtZQUNoQyw0QkFBNEI7WUFDNUIsSUFBSSxXQUFXSSxRQUFRO2dCQUNyQixzRUFBc0U7Z0JBQ3RFLE9BQU8sT0FBeUJDLEtBQUs7WUFDdkM7UUFDRjtRQUVBLElBQUkxQixLQUFLSyxPQUFPLENBQUNzQixVQUFVLEVBQUUsT0FBTzNCLEtBQUtLLE9BQU8sQ0FBQ3NCLFVBQVUsQ0FBQ1g7SUFDOUQ7QUFDRiIsInNvdXJjZXMiOlsiL2hvbWUvdXNlci9zdHVkaW8vd29ya2VyL2luZGV4LnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vLyA8cmVmZXJlbmNlIGxpYj1cIndlYndvcmtlclwiIC8+XG5kZWNsYXJlIGNvbnN0IHNlbGY6IFNlcnZpY2VXb3JrZXJHbG9iYWxTY29wZTtcblxuc2VsZi5hZGRFdmVudExpc3RlbmVyKCdpbnN0YWxsJywgKCkgPT4ge1xuICBzZWxmLnNraXBXYWl0aW5nKCk7XG59KTtcblxuc2VsZi5hZGRFdmVudExpc3RlbmVyKCdhY3RpdmF0ZScsIChldmVudCkgPT4ge1xuICBldmVudC53YWl0VW50aWwoc2VsZi5jbGllbnRzLmNsYWltKCkpO1xufSk7XG5cbnNlbGYuYWRkRXZlbnRMaXN0ZW5lcigncHVzaCcsIChldmVudCkgPT4ge1xuICBldmVudC53YWl0VW50aWwoKGFzeW5jICgpID0+IHtcbiAgICBsZXQgcGF5bG9hZDogYW55ID0gbnVsbDtcblxuICAgIGlmIChldmVudC5kYXRhKSB7XG4gICAgICB0cnkge1xuICAgICAgICBwYXlsb2FkID0gZXZlbnQuZGF0YS5qc29uKCk7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgLy8gSWYgSlNPTiBwYXJzaW5nIGZhaWxzLCB0cmVhdCBpdCBhcyBwbGFpbiB0ZXh0LlxuICAgICAgICBwYXlsb2FkID0geyB0aXRsZTogJ2VBcmVuYScsIGJvZHk6IGF3YWl0IGV2ZW50LmRhdGEudGV4dCgpIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCFwYXlsb2FkKSByZXR1cm47XG5cbiAgICBjb25zdCB0aXRsZSA9IHBheWxvYWQudGl0bGUgfHwgJ2VBcmVuYSc7XG4gICAgY29uc3Qgb3B0aW9uczogTm90aWZpY2F0aW9uT3B0aW9ucyA9IHtcbiAgICAgIGJvZHk6IHBheWxvYWQuYm9keSB8fCAnJyxcbiAgICAgIGljb246IHBheWxvYWQuaWNvbiB8fCAnL2ljb25zL2FuZHJvaWQvYW5kcm9pZC1sYXVuY2hlcmljb24tMTkyLTE5Mi5wbmcnLFxuICAgICAgYmFkZ2U6ICcvaWNvbnMvYW5kcm9pZC9hbmRyb2lkLWxhdW5jaGVyaWNvbi03Mi03Mi5wbmcnLFxuICAgICAgZGF0YTogeyBocmVmOiBwYXlsb2FkLmhyZWYgfHwgcGF5bG9hZC5kYXRhPy5ocmVmIHx8ICcvJyB9LFxuICAgIH07XG5cbiAgICBhd2FpdCBzZWxmLnJlZ2lzdHJhdGlvbi5zaG93Tm90aWZpY2F0aW9uKHRpdGxlLCBvcHRpb25zKTtcbiAgfSkoKSk7XG59KTtcblxuc2VsZi5hZGRFdmVudExpc3RlbmVyKCdub3RpZmljYXRpb25jbGljaycsIChldmVudCkgPT4ge1xuICBldmVudC5ub3RpZmljYXRpb24uY2xvc2UoKTtcblxuICBjb25zdCBocmVmID0gKGV2ZW50Lm5vdGlmaWNhdGlvbi5kYXRhIGFzIGFueSk/LmhyZWYgfHwgJy8nO1xuXG4gIGV2ZW50LndhaXRVbnRpbCgoYXN5bmMgKCkgPT4ge1xuICAgIGNvbnN0IGNsaWVudHNMaXN0ID0gYXdhaXQgc2VsZi5jbGllbnRzLm1hdGNoQWxsKHsgdHlwZTogJ3dpbmRvdycsIGluY2x1ZGVVbmNvbnRyb2xsZWQ6IHRydWUgfSk7XG5cbiAgICBmb3IgKGNvbnN0IGNsaWVudCBvZiBjbGllbnRzTGlzdCkge1xuICAgICAgLy8gSWYgYWxyZWFkeSBvcGVuLCBmb2N1cyBpdFxuICAgICAgaWYgKCdmb2N1cycgaW4gY2xpZW50KSB7XG4gICAgICAgIC8vIE9wdGlvbmFsOiBpZiB5b3Ugd2FudCBzdHJpY3QgbWF0Y2gsIGNvbXBhcmUgb3JpZ2lucyArIHBhdGggcHJvcGVybHlcbiAgICAgICAgcmV0dXJuIChjbGllbnQgYXMgV2luZG93Q2xpZW50KS5mb2N1cygpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChzZWxmLmNsaWVudHMub3BlbldpbmRvdykgcmV0dXJuIHNlbGYuY2xpZW50cy5vcGVuV2luZG93KGhyZWYpO1xuICB9KSgpKTtcbn0pO1xuIl0sIm5hbWVzIjpbInNlbGYiLCJhZGRFdmVudExpc3RlbmVyIiwic2tpcFdhaXRpbmciLCJldmVudCIsIndhaXRVbnRpbCIsImNsaWVudHMiLCJjbGFpbSIsInBheWxvYWQiLCJkYXRhIiwianNvbiIsInRpdGxlIiwiYm9keSIsInRleHQiLCJvcHRpb25zIiwiaWNvbiIsImJhZGdlIiwiaHJlZiIsInJlZ2lzdHJhdGlvbiIsInNob3dOb3RpZmljYXRpb24iLCJub3RpZmljYXRpb24iLCJjbG9zZSIsImNsaWVudHNMaXN0IiwibWF0Y2hBbGwiLCJ0eXBlIiwiaW5jbHVkZVVuY29udHJvbGxlZCIsImNsaWVudCIsImZvY3VzIiwib3BlbldpbmRvdyJdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///./worker/index.ts\n"));

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			if (cachedModule.error !== undefined) throw cachedModule.error;
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			id: moduleId,
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/trusted types policy */
/******/ 	(() => {
/******/ 		var policy;
/******/ 		__webpack_require__.tt = () => {
/******/ 			// Create Trusted Type policy if Trusted Types are available and the policy doesn't exist yet.
/******/ 			if (policy === undefined) {
/******/ 				policy = {
/******/ 					createScript: (script) => (script)
/******/ 				};
/******/ 				if (typeof trustedTypes !== "undefined" && trustedTypes.createPolicy) {
/******/ 					policy = trustedTypes.createPolicy("nextjs#bundler", policy);
/******/ 				}
/******/ 			}
/******/ 			return policy;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/trusted types script */
/******/ 	(() => {
/******/ 		__webpack_require__.ts = (script) => (__webpack_require__.tt().createScript(script));
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/react refresh */
/******/ 	(() => {
/******/ 		if (__webpack_require__.i) {
/******/ 		__webpack_require__.i.push((options) => {
/******/ 			const originalFactory = options.factory;
/******/ 			options.factory = (moduleObject, moduleExports, webpackRequire) => {
/******/ 				const hasRefresh = typeof self !== "undefined" && !!self.$RefreshInterceptModuleExecution$;
/******/ 				const cleanup = hasRefresh ? self.$RefreshInterceptModuleExecution$(moduleObject.id) : () => {};
/******/ 				try {
/******/ 					originalFactory.call(this, moduleObject, moduleExports, webpackRequire);
/******/ 				} finally {
/******/ 					cleanup();
/******/ 				}
/******/ 			}
/******/ 		})
/******/ 		}
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	
/******/ 	// noop fns to prevent runtime errors during initialization
/******/ 	if (typeof self !== "undefined") {
/******/ 		self.$RefreshReg$ = function () {};
/******/ 		self.$RefreshSig$ = function () {
/******/ 			return function (type) {
/******/ 				return type;
/******/ 			};
/******/ 		};
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module can't be inlined because the eval-source-map devtool is used.
/******/ 	var __webpack_exports__ = __webpack_require__("./worker/index.ts");
/******/ 	
/******/ })()
;