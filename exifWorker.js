var amd = true;
var EXIF = null;
function define(name, _, factory) {
	EXIF = factory();
}

importScripts("exif.js");

onmessage = function(e) {
	var id = e.data.id;
	var blob = e.data.blob;
	var fr = new FileReader();
	fr.onload = function(_) {
		var exif = EXIF.readFromBinaryFile(fr.result);
		postMessage({ id: id, exif: exif });
	};
	fr.readAsArrayBuffer(blob.slice(0, 1048576));
};
