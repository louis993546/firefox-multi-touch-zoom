/**

Multi-touch zoom extension for Firefox
Enables smooth pinch to zoom on desktop

Requires Firefox 55 or greater

@Author: George Corney / haxiomic
@Website: http://github.com/haxiomic
@Email: haxiomic@gmail.com

Please report issues to the github repository
	https://github.com/haxiomic/firefox-multi-touch-zoom

Feel free to get in touch via email if you have any questions

**/

console.log('printing');

// or the short variant
// browser.tabs.query({currentWindow: true, active: true}).then((tabs) => {
//     let tab = tabs[0]; // Safe to assume there will only be one result
//     console.log(`you are visiting ${tab.url}`);
// }, console.error);
let url = window.location.hostname;
let shouldSkip = url == "www.figma.com";

if (shouldSkip) { 
	console.log("skip") 
} else {
	 // view scaling parameters and other options
	const isMac = navigator.platform.toLowerCase().indexOf('mac') >= 0;
	const scaleMode = 1; // 0 = always high quality, 1 = low-quality while zooming
	const minScale = 1.0;
	const maxScale = 10;
	const zoomSpeedMultiplier = (isMac ? 0.015 : 0.03) / 5;
	const overflowTimeout_ms = 400;
	const highQualityWait_ms = 40;
	const alwaysHighQuality = false;

	// settings
	let shiftKeyZoom = true; // enable zoom with shift + scroll by default
	let pinchZoomSpeed = 5;
	let disableScrollbarsWhenZooming = false;

	// state
	let pageScale = 1;
	let translationX = 0;
	let translationY = 0;
	let overflowTranslationX = 0;
	let overflowTranslationY = 0;

	let touchLastCentreDistance = 0;
	let touchLastCentreX = 0;
	let touchLastCentreY = 0;
	let touchCentreChangeX = 0;
	let touchCentreChangeY = 0;

	// elements
	let pageElement = document.documentElement;
	let scrollBoxElement = document.documentElement; // this is the scroll-box
	let wheelEventElement = document.documentElement;
	let touchEventElement = document.documentElement;
	let scrollEventElement = window;

	const quirksMode = document.compatMode === 'BackCompat';

	// if the pageElement is missing a doctype or the doctype is set to < HTML 4.01 then Firefox renders in quirks mode
	// we cannot use the scroll fields on the <html> element, instead we must use the body
	// "(quirks mode bug 211030) The scrollLeft, scrollTop, scrollWidth, and scrollHeight properties are relative to BODY in quirks mode (instead of HTML)."
	if (quirksMode) {
		scrollBoxElement = document.body;
	}

	// apply user settings
	browser.storage.local.get([
		'mtzoom_shiftkey',
		'mtzoom_speed',
		'mtzoom_disableScrollbarsWhenZooming',
	], function (res) {
		if (res.mtzoom_shiftkey != null) {
			shiftKeyZoom = res.mtzoom_shiftkey;
		}
		if (res.mtzoom_speed != null) {
			pinchZoomSpeed = res.mtzoom_speed;
		}
		if (res.mtzoom_disableScrollbarsWhenZooming != null) {
			disableScrollbarsWhenZooming = res.mtzoom_disableScrollbarsWhenZooming;
		}
	});

	// browser-hint optimization - I found this causes issues with some sites like maps.google.com
	// pageElement.style.willChange = 'transform';

	// we track the state of the ctrl key in order to distinguish mouse-wheel events from pinch gestures
	let realCtrlDown = false;
	let updateRealCtrl = (e) => realCtrlDown = e.ctrlKey;
	window.addEventListener(`keydown`, updateRealCtrl);
	window.addEventListener(`keyup`, updateRealCtrl);
	window.addEventListener(`mousemove`, updateRealCtrl);

	// cmd + 0 or ctrl + 0 to restore zoom
	window.addEventListener('keydown', (e) => {
		if (e.key == '0' && (isMac ? e.metaKey : e.ctrlKey)) {
			resetScale();
		}
	});

	// because scroll top/left are handled as integers only, we only read the translation from scroll once scroll has changed
	// if we didn't, our translation would have ugly precision issues => setTranslationX(4.5) -> translationX = 4
	let ignoredScrollLeft = null;
	let ignoredScrollTop = null;
	function updateTranslationFromScroll(){
		if (scrollBoxElement.scrollLeft !== ignoredScrollLeft) {
			translationX = -scrollBoxElement.scrollLeft;
			ignoredScrollLeft = null;
		}
		if (scrollBoxElement.scrollTop !== ignoredScrollTop) {
			translationY = -scrollBoxElement.scrollTop;
			ignoredScrollTop = null;
		}
	}
	scrollEventElement.addEventListener(`scroll`, updateTranslationFromScroll);


	touchEventElement.addEventListener(`touchmove`, (e) => {

		let touchInputs = e.touches;
		if(touchInputs.length >= 2){
			if (e.defaultPrevented) return;

			let touchCentreX = (touchInputs[0].clientX + touchInputs[touchInputs.length - 1].clientX) / 2; //gets the x position of the centre point between two inputs
			let touchCentreY = (touchInputs[0].clientY + touchInputs[touchInputs.length - 1].clientY) / 2; //gets the y position of the centre point between two inputs

			let touchCentreDistanceX = Math.max(touchInputs[0].clientX,touchInputs[touchInputs.length - 1].clientX) - touchCentreX; //gets the horizontal distance between the input and centre point
			let touchCentreDistanceY = Math.max(touchInputs[0].clientY,touchInputs[touchInputs.length - 1].clientY) - touchCentreY; //gets the vertical distance between the input and centre point
			let touchCentreDistance = Math.round(Math.sqrt(Math.pow(touchCentreDistanceX, 2) + Math.pow(touchCentreDistanceY, 2))); //gets the actual distance between between the input and centre point

			let X = touchCentreX - scrollBoxElement.offsetLeft;
			let Y = touchCentreY - scrollBoxElement.offsetTop;

			if(touchLastCentreX == 0 && touchLastCentreY == 0){
				touchLastCentreX = touchCentreX;
				touchLastCentreY = touchCentreY;
			}
			touchCentreChangeX = touchCentreX - touchLastCentreX;
			touchCentreChangeY = touchCentreY - touchLastCentreY;
			touchLastCentreX = touchCentreX;
			touchLastCentreY = touchCentreY;

			let touchScaleFactor = 1; //Default scale factor
			if(touchLastCentreDistance != 0){
				touchScaleFactor = touchCentreDistance / touchLastCentreDistance; //gets the new factor, by which the page will be scaled.
			}
			touchLastCentreDistance = touchCentreDistance;
			applyScale(touchScaleFactor, X, Y, true);
			e.preventDefault(); //Prevent default zooming
			e.stopPropagation();
		}
		else{
			restoreControl();
		}
	}, false);

	touchEventElement.addEventListener(`touchend`, (e) => {
		touchLastCentreDistance = 0; //prevents the page from jumping around when fingers are added or removed
		if(e.touches.length < 2){
			// high quality render when zooming finished
			pageElement.style.setProperty('transform', `scaleX(${pageScale}) scaleY(${pageScale})`, 'important');
			restoreControl(); // restore scrollbars
		}
	});
	touchEventElement.addEventListener(`touchstart`, (e) => {
		touchLastCentreDistance = 0;
		touchCentreChangeX = 0;
		touchCentreChangeY = 0;
		touchLastCentreX = 0;
		touchLastCentreY = 0;
	});


	wheelEventElement.addEventListener(`wheel`, (e) => {
		// when pinching, Firefox will set the 'ctrlKey' flag to true, even when ctrl is not pressed
		// we can use this fact to distinguish between scrolling and pinching
		// ! it turns out this is only the case on macOS - on Windows, a ctrl key down event seems to be fired right before the wheel event...
		let firefoxPseudoPinch = e.ctrlKey && (isMac ? !realCtrlDown : true);
		if (firefoxPseudoPinch || (e.shiftKey && shiftKeyZoom)) {
			if (e.defaultPrevented) return;

			let x = e.clientX - scrollBoxElement.offsetLeft;
			let y = e.clientY - scrollBoxElement.offsetTop;
			// x in non-scrolling, non-transformed coordinates relative to the scrollBoxElement
			// 0 is always the left side and <width> is always the right side

			let deltaMultiplier = pinchZoomSpeed * zoomSpeedMultiplier;

			let newScale = pageScale + e.deltaY * deltaMultiplier;
			let scaleBy = pageScale/newScale;

			applyScale(scaleBy, x, y, false);

			e.preventDefault();
			e.stopPropagation();
		} else {
			// e.preventDefault();
			restoreControl();
		}
	}, false);

	scrollBoxElement.addEventListener(`mousemove`, restoreControl);
	scrollBoxElement.addEventListener(`mousedown`, restoreControl);

	let controlDisabled = false;
	function disableControl() {
		if (controlDisabled) return;

		if (disableScrollbarsWhenZooming) {
			let verticalScrollBarWidth = window.innerWidth - pageElement.clientWidth;
			let horizontalScrollBarWidth = window.innerHeight - pageElement.clientHeight;

			// disable scrolling for performance
			pageElement.style.setProperty('overflow', 'hidden', 'important');

			// since we're disabling a scrollbar we need to apply a margin to replicate the offset (if any) it introduced
			// this prevent the page from being shifted about as the scrollbar is hidden and shown
			pageElement.style.setProperty('margin-right', verticalScrollBarWidth + 'px', 'important');
			pageElement.style.setProperty('margin-bottom', horizontalScrollBarWidth + 'px', 'important');
		}

		// document.body.style.pointerEvents = 'none';
		controlDisabled = true;
	}

	function restoreControl() {
		if (!controlDisabled) return;
		// scrolling must be enabled for panning
		pageElement.style.overflow = 'auto';
		pageElement.style.marginRight = '';
		pageElement.style.marginBottom = '';
		// document.body.style.pointerEvents = '';
		controlDisabled = false;
	}

	let qualityTimeoutHandle = null;
	let overflowTimeoutHandle = null;

	function updateTransform(scaleModeOverride, shouldDisableControl, touch) {
		if (shouldDisableControl == null) {
			shouldDisableControl = true;
		}

		let sm = scaleModeOverride == null ? scaleMode : scaleModeOverride;

		if (sm === 0 || alwaysHighQuality) {
			// scaleX/scaleY
			pageElement.style.setProperty('transform', `scaleX(${pageScale}) scaleY(${pageScale})`, 'important');
		} else {
			// perspective (reduced quality but faster)
			let p = 1; // what's the best value here?
			let z = p - p/pageScale;

			pageElement.style.setProperty('transform', `perspective(${p}px) translateZ(${z}px)`, 'important');

			// wait a short period before restoring the quality
			// we use a timeout for trackpad because we can't detect when the user has finished the gesture on the hardware
			// we can only detect gesture update events ('wheel' + ctrl)
			if(touch != true){ //prevents this from occuring when using touchscreen
				window.clearTimeout(qualityTimeoutHandle);
				qualityTimeoutHandle = setTimeout(function(){
					pageElement.style.setProperty('transform', `scaleX(${pageScale}) scaleY(${pageScale})`, 'important');
				}, highQualityWait_ms);
			}
		}
		if(touch == true){
			scrollBoxElement.scrollLeft -= touchCentreChangeX * pageScale;
			scrollBoxElement.scrollTop -= touchCentreChangeY * pageScale;
		}

		pageElement.style.setProperty('transform-origin', '0 0', 'important');

		// hack to restore normal behavior that's upset after applying the transform
		pageElement.style.position = `relative`;
		pageElement.style.height = `100%`;

		// when translation is positive, the offset is applied via left/top positioning
		// negative translation is applied via scroll
		if (minScale < 1) {
			pageElement.style.setProperty('left', `${Math.max(translationX, 0) - overflowTranslationX}px`, 'important');
			pageElement.style.setProperty('top', `${Math.max(translationY, 0) - overflowTranslationY}px`, 'important');
		}

		// weird performance hack - is it batching the changes?
		pageElement.style.transitionProperty = `transform, left, top`;
		pageElement.style.transitionDuration = `0s`;

		if (shouldDisableControl) {
			disableControl();
			if(touch != true){
				clearTimeout(overflowTimeoutHandle);
				overflowTimeoutHandle = setTimeout(function(){
					restoreControl();
				}, overflowTimeout_ms);
			}
		}
	}

	function applyScale(scaleBy, x_scrollBoxElement, y_scrollBoxElement, touch) {
		// x/y coordinates in untransformed coordinates relative to the scroll container
		// if the container is the window, then the coordinates are relative to the window
		// ignoring any scroll offset. The coordinates do not change as the page is transformed

		function getTranslationX(){ return translationX; }
		function getTranslationY(){ return translationY; }
		function setTranslationX(v) {
			// clamp v to scroll range
			// this limits minScale to 1
			v = Math.min(v, 0);
			v = Math.max(v, -scrollBoxElement.scrollLeftMax);

			translationX = v;

			scrollBoxElement.scrollLeft = Math.max(-v, 0);
			ignoredScrollLeft = scrollBoxElement.scrollLeft;

			// scroll-transform what we're unable to apply
			// either there is no scroll-bar or we want to scroll past the end
			overflowTranslationX = v < 0 ? Math.max((-v) - scrollBoxElement.scrollLeftMax, 0) : 0;
		}
		function setTranslationY(v) {
			// clamp v to scroll range
			// this limits minScale to 1
			v = Math.min(v, 0);
			v = Math.max(v, -scrollBoxElement.scrollTopMax);

			translationY = v;

			scrollBoxElement.scrollTop = Math.max(-v, 0);
			ignoredScrollTop = scrollBoxElement.scrollTop;

			overflowTranslationY = v < 0 ? Math.max((-v) - scrollBoxElement.scrollTopMax, 0) : 0;
		}

		// resize pageElement
		let pageScaleBefore = pageScale;
		pageScale *= scaleBy;
		pageScale = Math.min(Math.max(pageScale, minScale), maxScale);
		let effectiveScale = pageScale/pageScaleBefore;

		// when we hit min/max scale we can early exit
		if (effectiveScale === 1) return;

		updateTransform(null, null, touch);

		let zx = x_scrollBoxElement;
		let zy = y_scrollBoxElement;

		// calculate new xy-translation
		let tx = getTranslationX();
		tx = (tx - zx) * (effectiveScale) + zx;

		let ty = getTranslationY();
		ty = (ty - zy) * (effectiveScale) + zy;

		// apply new xy-translation
		setTranslationX(tx);
		setTranslationY(ty);

		updateTransform(null, null, touch);
	}

	function resetScale() {
		// reset state
		pageScale = 1;
		translationX = 0;
		translationY = 0;
		overflowTranslationX = 0;
		overflowTranslationY = 0;

		let scrollLeftBefore = scrollBoxElement.scrollLeft;
		let scrollLeftMaxBefore = scrollBoxElement.scrollMax;
		let scrollTopBefore = scrollBoxElement.scrollTop;
		let scrollTopMaxBefore = scrollBoxElement.scrollTopMax;
		updateTransform(0, false, false);

		// restore scroll
		scrollBoxElement.scrollLeft = (scrollLeftBefore/scrollLeftMaxBefore) * scrollBoxElement.scrollLeftMax;
		scrollBoxElement.scrollTop = (scrollTopBefore/scrollTopMaxBefore) * scrollBoxElement.scrollTopMax;

		updateTranslationFromScroll();

		// undo other css changes
		pageElement.style.overflow = '';
		// document.body.style.pointerEvents = '';
	}
}
