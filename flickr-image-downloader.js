'use strict';

// Load required packages
var _ = require('lodash'),
	util = require('util'),
	fs = require('fs-extra'),
	events = require('events'),
	request = require('request'),
	cheerio = require('cheerio');

// Module to export
function FlickrImageDownloader () {
	var that = this;
	
	that.url = '';
	that.delay = 500;
	that.downloadFolder = '';

	that.paths = {};
	that.paths.base = 'https://www.flickr.com';
	that.paths.photostream = 'photos/!username';
	that.paths.set = that.paths.photostream + '/sets';
	that.paths.favorites = that.paths.photostream + '/favorites';

	that.image = {};
	that.image.dataAttr = 'deferSrc';
	that.image.selector = 'div#photo-display-container img.pc_img';	
	
	// Events constructor
	events.EventEmitter.call(that);

	// Setup listeners
	that.on('pageCountLoaded', function () {
		console.log('Event::pageCountLoaded');
		that.getImageUrls();
	});

	that.on('imageUrlsLoaded', function () {
		console.log('Event::imageUrlsLoaded');
		that.downloadImages();
	});

	that.on('downloadFinished', function (imageUrl) {
		console.log('Event::downloadFinished(' + imageUrl + ')');
	});

	that.on('allDownloadsFinished', function () {
		console.log('Event::allDownloadsFinished');
	});

	that.on('error', function (functionName, error) {
		console.log('Event::Error (' + functionName + ')', error);
	});
};

util.inherits(FlickrImageDownloader, events.EventEmitter);

FlickrImageDownloader.prototype.getImages = function (username, stream, downloadFolder) {
	var that = this;

	that.imageUrls = [];
	that.pageCount = 0;
	that.processedPageCount = 0;
	that.downloadFolder = downloadFolder || 'images';
	that.url = [that.paths.base, that.paths[stream]].join('/').replace('!username', username);

	// Ensure download directory exists
	fs.ensureDir(that.downloadFolder, function(error) {
		if (error) {
			that.emit('error', 'ensureDir', error);
		}
	});

	that.getPageCount();
};

FlickrImageDownloader.prototype.getPageCount = function () {
	var $,
		that = this;

	request(that.url, function (error, response, body) {
		if (error) {
			that.emit('error', 'getPageCount', error);
		} 
		else {
			$ = cheerio.load(body);
			that.pageCount = $('.Pages').data('pageCount');
			
			that.emit('pageCountLoaded');
		}
	});
};

FlickrImageDownloader.prototype.getImageUrls = function () {
	var $, pageNumber, url, pageUri,
		that = this;

	for (pageNumber = 1; pageNumber <= that.pageCount; pageNumber++) {
		pageUri = 'page' + pageNumber;
		url = [that.url, pageUri].join('/');
		
		request(url, function (error, response, body) {
			if (error) {
				that.emit('error', 'getImageUrls', error);
			} 
			else {
				$ = cheerio.load(body);
				
				$(that.image.selector).each(function () {
					that.imageUrls.push($(this).data(that.image.dataAttr).replace('.jpg', '_b.jpg'));
				});
			}

			that.processedPageCount++;

			if (that.processedPageCount === that.pageCount) {
				that.imageUrls = _.unique(that.imageUrls);
				
				that.emit('imageUrlsLoaded');
			}
		});
	}
};

FlickrImageDownloader.prototype.downloadImages = function () {
	var that = this,
		delay = that.delay,
		imagesDownloaded = 0;

	_.each(that.imageUrls, function (imageUrl) {
		var filepath = that.downloadFolder + '/' + _(imageUrl.split('/')).last();

		setTimeout(function () {
			request
				.get(imageUrl)
				.pipe(fs.createWriteStream(filepath))
				.on('close', function () {
					imagesDownloaded++;
					
					that.emit('downloadFinished', imageUrl);

					if (imagesDownloaded === that.imageUrls.length) {
						that.emit('allDownloadsFinished');
					}
				})
				.on('error', function (error) {
					that.emit('error', 'downloadImages', error);
				});
		}, delay);

		delay += that.delay;
	});
};

// Export module
module.exports = FlickrImageDownloader;
