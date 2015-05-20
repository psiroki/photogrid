var DOMURL = window.URL || window.webkitURL || window;
var exif = new Worker("exifWorker.js");
var viewTemplate = null;

var calls = { };
var callCounter = 0;

exif.onmessage = function(e) {
	var id = e.data.id;
	var cb = calls[e.data.id];
	delete calls[e.data.id];
	if(cb)
		cb(e.data.exif);
}

function getExif(blob, cb) {
	var id = (++callCounter).toString();
	calls[id] = cb;
	exif.postMessage({ id: id, blob: blob });
}

function enclose(img, size) {
	var w = img.naturalWidth;
	var h = img.naturalHeight;
	if(w > size) {
		w = size;
		h = img.naturalHeight/img.naturalWidth*w;
	}
	if(h > size) {
		h = size;
		w = img.naturalWidth/img.naturalHeight*h;
	}
	
	return { w: w, h: h };
}

function dataURLToBlob(dataURL) {
	var BASE64_MARKER = ';base64,';
	if (dataURL.indexOf(BASE64_MARKER) == -1) {
		var parts = dataURL.split(',');
		var contentType = parts[0].split(':')[1];
		var raw = decodeURIComponent(parts[1]);

		return new Blob([raw], {type: contentType});
	}

	var parts = dataURL.split(BASE64_MARKER);
	var contentType = parts[0].split(':')[1];
	var raw = window.atob(parts[1]);
	var rawLength = raw.length;

	var uInt8Array = new Uint8Array(rawLength);

	for (var i = 0; i < rawLength; ++i) {
		uInt8Array[i] = raw.charCodeAt(i);
	}

	return new Blob([uInt8Array], {type: contentType});
}

function scaleImage(img, tw, th) {
	tw |= 0;
	th |= 0;
	var sw = img.naturalWidth;
	var sh = img.naturalHeight;
	var canvas = document.createElement("canvas");
	canvas.width = sw;
	canvas.height = sh;
	var ctx = canvas.getContext("2d");
	ctx.drawImage(img, 0, 0);
	var sourceImageData = ctx.getImageData(0, 0, sw, sh);
	if(sw == tw && sh == th)
		return canvas;
	var source = sourceImageData.data;
	var targetImageData = ctx.createImageData(tw, th);
	var target = targetImageData.data;
	var targetLine = new Uint32Array(4*tw);
	var sampleCount = new Uint32Array(tw);
	var ty = 0;
	var tyc = 0;
	var srcLine = 0;
	var trgLine = 0;
	for(var sy=0; sy<sh; ++sy) {
		var tx = 0;
		var txc = 0;
		for(var sx=0; sx<sw; ++sx) {
			++sampleCount[tx];
			for(var c=0; c<4; ++c)
				targetLine[4*tx+c] += source[srcLine+sx*4+c];
			txc += tw;
			if(txc >= sw) {
				txc -= sw;
				++tx;
			}
		}
		srcLine += sw*4;
		tyc += th;
		if(tyc >= sh) {
			for(var tx=0; tx<tw; ++tx) {
				for(var c=0; c<4; ++c) {
					target[trgLine+tx*4+c] = targetLine[tx*4+c]/sampleCount[tx];
				}
			}
			
			for(var tx=0; tx<tw; ++tx) {
				for(var c=0; c<4; ++c) {
					targetLine[tx*4+c] = 0;
				}
				sampleCount[tx] = 0;
			}
						
			tyc -= sh;
			trgLine += tw*4;
			++ty;
		}
	}
	
	canvas.width = tw;
	canvas.height = th;
	ctx.clearRect(0, 0, tw, th);
	ctx.putImageData(targetImageData, 0, 0);

	return canvas;
}

function checkMulti() {
	var views = document.querySelectorAll(".view").length;
	var state = { empty: views == 0, multiple: views > 1 };
	for(var key in state) {
		if(state[key])
			document.body.classList.add(key);
		else
			document.body.classList.remove(key);
	}
}

function drawWithImage(fn, img, info) {
	try {
		info = info || { };
		document.body.classList.add("busy");
		var o = info && typeof info.Orientation === "number" ? info.Orientation : 0;
		var s = enclose(img, 640);
		var w = s.w;
		var h = s.h;
		if(o > 4) {
			w = s.h;
			h = s.w;
		}
		var canvas = document.createElement("canvas");
		canvas.width = w;
		canvas.height = h;
		var div = viewTemplate.cloneNode(true);
		var ownBar = div.querySelector(".snackBar");
		div.querySelector(".canvasHolder").appendChild(canvas);
		document.body.appendChild(div);
		checkMulti();
		var ctx = canvas.getContext("2d");
		ctx.save();
		if(o >= 1) {
			var mat = new Float32Array(6);
			var x = o <= 4 ? 0 : 1;
			var y = o <= 4 ? 1 : 0;
			var xs = (o&3)>>1 ? -1 : 1;
			var ys = ((o-1)&3)>>1 ? -1 : 1;
			mat[2*x] = xs;
			mat[2*y] = 0;
			mat[2*x+1] = 0;
			mat[2*y+1] = ys;
			mat[4] = -w*Math.min(0, xs);
			mat[5] = -h*Math.min(0, ys);
			ctx.transform(mat[0], mat[1], mat[2], mat[3], mat[4], mat[5]);
		}
		if(info.crossOrigin)
			ctx.drawImage(img, 0, 0, s.w, s.h);
		else
			ctx.drawImage(scaleImage(img, s.w, s.h), 0, 0);
		ctx.restore();
		
		var invGolden = 2/(1+Math.sqrt(5));
		var g = [ 0, 1-invGolden, invGolden, 1 ];
		var colors = [ "black", "white" ];
		
		function gridLines(ratio) {
			var x = (ratio*w|0)+0.5;
			var y = (ratio*h|0)+0.5;
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, h);
			ctx.stroke();
			
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(w, y);
			ctx.stroke();
		}
		
		for(var i=1; i<3; ++i) {
			for(var j=0; j<2; ++j) {
				ctx.strokeStyle = colors[j];
				ctx.lineWidth = 2-j;
				ctx.setLineDash([]);
				gridLines(i/3);
				ctx.setLineDash([5-j*2, 1+j*2]);
				ctx.lineDashOffset = 1-j;
				gridLines(g[i]);
			}
		}
		Array.prototype.slice.call(ownBar.querySelectorAll(".saveButton"))
			.forEach(function(e) {
				if(info.crossOrigin)
					e.style.display = "none";
				e.addEventListener("click", function() {
					saveAsJPG(canvas, fn);
				});
			});
		Array.prototype.slice.call(ownBar.querySelectorAll(".closeButton"))
			.forEach(function(e) {
				e.addEventListener("click", function() {
					if(ownBar.parentNode) {
						var p = ownBar.parentNode;
						while(p && p !== document.body && !p.classList.contains("view"))
							p = p.parentNode;
						if(p.parentNode) {
							p.parentNode.removeChild(p);
							checkMulti();
						}
					}
				});
			});
	} finally {
		document.body.classList.remove("busy");
	}
}

var lastErrorTimeout = null;

function error(ignoreBusy) {
	if(!ignoreBusy)
		document.body.classList.remove("busy");
	document.body.classList.add("error");
	if(lastErrorTimeout !== null)
		clearTimeout(lastErrorTimeout);
	lastErrorTimeout = setTimeout(function() {
		document.body.classList.remove("error");
	}, 3000);
}

function generate(f, exif) {
	if(this === background && background.files.length > 0) {
		var bgf = background.files[0];
		return generate(bgf);
	}
	
	if(f instanceof Blob) {
		if(arguments.length <= 1) {
			getExif(f, function(exif) {
				if(exif)
					console.log(f.name+" has exif:", exif);
				generate(f, exif);
			});
			return;
		}
		document.body.classList.add("busy");
		var fn = f.name.replace(/^(?:.*[\\\/])?([^\\\/]+)$/, "$1");
		var img = new Image();
		img.onload = function() {
			drawWithImage(fn, img, exif);
		};
		img.onerror = function() {
			error();
		};
		var reader = new FileReader();
		reader.onload = function() {
			img.src = this.result;
		};
		reader.readAsDataURL(f);
	}
}

function saveAsJPG(canvas, filename) {
	var canvasDataUrl = canvas.toDataURL("image/jpeg", 0.75);
	var blob = dataURLToBlob(canvasDataUrl);
	var blobUrl = DOMURL.createObjectURL(blob);
	var a = document.createElement("a");
	a.href = blobUrl;
	a.download = filename;
	a.click();
	DOMURL.revokeObjectURL(blobUrl);
}

function isImageMime(s) {
	var prefix = "image/";
	return s.substring(0, prefix.length) === prefix;
}

function isDraggingImage(e) {
	var hasImage = false;
	var files = Array.prototype.slice.call(e.dataTransfer.files);
	if(files.length === 0)
		files = Array.prototype.slice.call(e.dataTransfer.items);
	files.forEach(function(f) {
		if(isImageMime(f.type)) {
			hasImage = true;
			return false;
		}
	});
	return hasImage;
}

function isUriListMime(s) {
	var mime = "text/uri-list";
	return s === mime;
}

function isDraggingLink(e) {
	var hasLink = false;
	var items = Array.prototype.slice.call(e.dataTransfer.items);
	items.forEach(function(f) {
		if(isUriListMime(f.type)) {
			hasLink = true;
			return false;
		}
	});
	return hasLink;
}

window.addEventListener("DOMContentLoaded", function() {
	background.addEventListener("change", generate);
	viewTemplate = document.querySelector(".view");
	viewTemplate.parentNode.removeChild(viewTemplate);
	document.addEventListener("dragover", function(e) {
		e.stopPropagation();
		e.preventDefault();
		var hasImage = isDraggingImage(e) || isDraggingLink(e);
		e.dataTransfer.dropEffect = hasImage ? "copy" : "none";
		if(hasImage)
			document.body.classList.add("dragOver");
		else
			document.body.classList.remove("dragOver");
	}, false);
	document.addEventListener("drop", function(e) {
		e.stopPropagation();
		e.preventDefault();
		document.body.classList.remove("dragOver");
		Array.prototype.slice.call(e.dataTransfer.items || []).forEach(function(item) {
			if(isUriListMime(item.type)) {
				item.getAsString(function(s) {
					document.body.classList.add("busy");
					var img = new Image();
					img.onload = function() {
						drawWithImage("grid.jpg", img, { crossOrigin: true });
					};
					img.onerror = function() {
						error();
					};
					img.src = s;
				});
			}
		});
		var files = Array.prototype.slice.call(e.dataTransfer.files || []);
		files.forEach(function(f) {
			if(isImageMime(f.type)) {
				generate(f);
			}
		});
	}, false);
	document.addEventListener("dragenter", function(e) {
		if(isDraggingImage(e) || isDraggingLink(e))
			document.body.classList.add("dragOver");
	}, false);
	var removeStyle = function(e) {
		e.stopPropagation();
		e.preventDefault();
		document.body.classList.remove("dragOver");
	};
	document.addEventListener("dragleave", removeStyle, false);
	document.addEventListener("dragend", removeStyle, false);
	checkMulti();
});
