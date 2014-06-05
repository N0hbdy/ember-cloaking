(function () {

  /**
    Display a list of cloaked items

    @class CloakedCollectionView
    @extends Ember.CollectionView
    @namespace Ember
  **/
  Ember.CloakedHorizontalCollectionView = Ember.CollectionView.extend({
    leftVisible: null,
    rightVisible: null,
    offsetFixedElement: null,

    init: function() {
      var cloakView = this.get('cloakView'),
          idProperty = this.get('idProperty'),
          uncloakDefault = !!this.get('uncloakDefault');

      // Set the slack ratio differently to allow for more or less slack in preloading
      var slackRatio = parseFloat(this.get('slackRatio'));
      if (!slackRatio) { this.set('slackRatio', 1.0); }

      this.set('itemViewClass', Ember.CloakedView.extend({
        classNames: [cloakView + '-cloak'],
        cloaks: cloakView,
        preservesContext: this.get('preservesContext') === "true",
        cloaksController: this.get('itemController'),
        defaultWidth: this.get('defaultWidth'),

        init: function() {
          this._super();

          if (idProperty) {
            this.set('elementId', cloakView + '-cloak-' + this.get('content.' + idProperty));
          }
          if (uncloakDefault) {
            this.uncloak();
          } else {
            this.cloak();
          }
        }
      }));

      this._super();
      Ember.run.next(this, 'scrolled');
    },


    /**
      If the leftmost visible view changed, we will notify the controller if it has an appropriate hook.

      @method _leftVisibleChanged
      @observes leftVisible
    **/
    _leftVisibleChanged: function() {
      var controller = this.get('controller');
      if (controller.leftVisibleChanged) { controller.leftVisibleChanged(this.get('leftVisible')); }
    }.observes('leftVisible'),

    /**
      If the rightmost visible view changed, we will notify the controller if it has an appropriate hook.

      @method _rightVisible
      @observes rightVisible
    **/
    _rightVisible: function() {
      var controller = this.get('controller');
      if (controller.rightVisibleChanged) { controller.rightVisibleChanged(this.get('rightVisible')); }
    }.observes('rightVisible'),

    /**
      Binary search for finding the leftmost view on screen.

      @method findLeftView
      @param {Array} childViews the childViews to search through
      @param {Number} windowLeft The left of the viewport to search against
      @param {Number} min The minimum index to search through of the child views
      @param {Number} max The max index to search through of the child views
      @returns {Number} the index into childViews of the leftmost view
    **/
    findLeftView: function(childViews, viewportLeft, min, max) {
      if (max < min) { return min; }

      var mid = Math.floor((min + max) / 2),
          // in case of not full-window scrolling
          scrollOffset = this.get('wrapperLeft') >> 0,
          $view = childViews[mid].$(),
          viewRight = $view.position().left + scrollOffset + $view.width();

      if (viewRight > viewportLeft) {
        return this.findLeftView(childViews, viewportLeft, min, mid-1);
      } else {
        return this.findLeftView(childViews, viewportLeft, mid+1, max);
      }
    },

    /**
      Determine what views are onscreen and cloak/uncloak them as necessary.

      @method scrolled
    **/
    scrolled: function() {
      if (!this.get('scrollingEnabled')) { return; }

      var childViews = this.get('childViews');
      if ((!childViews) || (childViews.length === 0)) { return; }

      var toUncloak = [],
          onscreen = [],
          // calculating viewport edges
          $w = $(window),
          windowWidth = this.get('wrapperWidth') || ( window.innerWidth ? window.innerWidth : $w.width() ),
          windowLeft = this.get('wrapperLeft') || $w.scrollLeft(),
          slack = Math.round(windowWidth * this.get('slackRatio')),
          viewportLeft = windowLeft - slack,
          windowRight = windowLeft + windowWidth,
          viewportRight = windowRight + slack,
          leftView = this.findLeftView(childViews, viewportLeft, 0, childViews.length-1),
          bodyWidth = this.get('wrapperWidth') ? this.$().width() : $('body').width(),
          rightView = leftView,
          offsetFixedElement = this.get('offsetFixedElement');

      if (windowRight > bodyWidth) { windowRight = bodyWidth; }
      if (viewportRight > bodyWidth) { viewportRight = bodyWidth; }

      if (offsetFixedElement) {
        windowLeft += (offsetFixedElement.outerWidth(true) || 0);
      }
      // Find the right view and what's onscreen
      while (rightView < childViews.length) {
        var view;
        if (childViews.objectAt) {
          // Lazy load what we need
          view = childViews.objectAt(rightView);
        } else {
          view = childViews[rightView];
        }
        var $view = view.$(),
          // in case of not full-window scrolling
          scrollOffset = this.get('wrapperLeft') >> 0,
          viewLeft = $view.position().left + scrollOffset,
          viewRight = viewLeft + $view.width();

        if (viewLeft > viewportRight) { break; }
        toUncloak.push(view);

        if (viewRight > windowLeft && viewLeft <= windowRight) {
          onscreen.push(view.get('content'));
        }

        rightView++;
      }
      if (rightView >= childViews.length) { rightView = childViews.length - 1; }

      // If our controller has a `sawObjects` method, pass the on screen objects to it.
      var controller = this.get('controller');
      if (onscreen.length) {
        this.setProperties({leftVisible: onscreen[0], rightVisible: onscreen[onscreen.length-1]});
        if (controller && controller.sawObjects) {
          Em.run.schedule('afterRender', function() {
            controller.sawObjects(onscreen);
          });
        }
      } else {
        this.setProperties({leftVisible: null, rightVisible: null});
      }

      var toCloak = childViews.slice(0, leftView).concat(childViews.slice(rightView+1));
      Em.run.schedule('afterRender', function() {
        toUncloak.forEach(function (v) { v.uncloak(); });
        toCloak.forEach(function (v) { v.cloak(); });
      });

      for (var j=rightView; j<childViews.length; j++) {
        var checkView = childViews[j];
        if (!checkView._containedView) {
          if (!checkView.get('loading')) {
            checkView.$().html(this.get('loadingHTML') || "Loading...");
          }
          return;
        }
      }

    },

    scrollTriggered: function() {
      Em.run.scheduleOnce('afterRender', this, 'scrolled');
    },

    _startEvents: function() {
      var self = this,
          offsetFixed = this.get('offsetFixed'),
          onScrollMethod = function() {
            Ember.run.debounce(self, 'scrollTriggered', 10);
          };

      if (offsetFixed) {
        this.set('offsetFixedElement', $(offsetFixed));
      }

      $(document).bind('touchmove.ember-cloak', onScrollMethod);
      $(window).bind('scroll.ember-cloak', onScrollMethod);
      $('#' + this.get("elementId")).bind("scroll.ember-cloak", onScrollMethod);
      $('#' + this.get("elementId")).bind("touchmove.ember-cloak", onScrollMethod);
      this.addObserver('wrapperLeft', self, onScrollMethod);
      this.addObserver('wrapperWidth', self, onScrollMethod);
      this.addObserver('content.@each', self, onScrollMethod);
      this.scrollTriggered();

      this.set('scrollingEnabled', true);
    }.on('didInsertElement'),

    cleanUp: function() {
      $(document).unbind('touchmove.ember-cloak');
      $(window).unbind('scroll.ember-cloak');
      this.set('scrollingEnabled', false);
    },

    _endEvents: function() {
      this.cleanUp();
    }.on('willDestroyElement')
  });


  /**
    A cloaked view is one that removes its content when scrolled off the screen

    @class CloakedView
    @extends Ember.View
    @namespace Ember
  **/
  Ember.CloakedView = Ember.View.extend({
    attributeBindings: ['style'],

    /**
      Triggers the set up for rendering a view that is cloaked.

      @method uncloak
    */
    uncloak: function() {
      if (!this._containedView) {
        var model = this.get('content'),
            controller = null,
            container = this.get('container');

        // Wire up the itemController if necessary
        var controllerName = this.get('cloaksController');
        if (controllerName) {
          var controllerFullName = 'controller:' + controllerName,
              factory = container.lookupFactory(controllerFullName),
              parentController = this.get('controller');

          // let ember generate controller if needed
          if (factory === undefined) {
            factory = Ember.generateControllerFactory(container, controllerName, model);

            // inform developer about typo
            Ember.Logger.warn('ember-cloaking: can\'t lookup controller by name "' + controllerFullName + '".');
            Ember.Logger.warn('ember-cloaking: using ' + factory.toString() + '.');
          }

          controller = factory.create({
            model: model,
            parentController: parentController,
            target: parentController
          });
        }

        var createArgs = {},
            target = controller || model;

        if (this.get('preservesContext')) {
          createArgs.content = target;
        } else {
          createArgs.context = target;
        }
        if (controller) { createArgs.controller = controller; }
        this.setProperties({
          style: null,
          loading: false
        });

        this._containedView = this.createChildView(this.get('cloaks'), createArgs);
        this.rerender();
      }
    },

    /**
      Removes the view from the DOM and tears down all observers.

      @method cloak
    */
    cloak: function() {
      var self = this;

      if (this._containedView && (this._state || this.state) === 'inDOM') {
        var style = 'width: ' + this.$().width() + 'px;';
        this.set('style', style);
        this.$().prop('style', style);

        // We need to remove the container after the width of the element has taken
        // effect.
        Ember.run.schedule('afterRender', function() {
          if(self._containedView){
            self._containedView.remove();
            self._containedView = null;
          }
        });
      }
    },

    willDestroyElement: function(){
      if(this._containedView){
        this._containedView.remove();
        this._containedView = null;
      }
      this._super();
    },

    didInsertElement: function(){
      if (!this._containedView) {
        // setting default width
        // but do not touch if width already defined
        if(!this.$().width()){
          var defaultWidth = 100;
          if(this.get('defaultWidth')) {
            defaultWidth = this.get('defaultWidth');
          }

          this.$().css('width', defaultWidth);
        }
      }
     },

    /**
      Render the cloaked view if applicable.

      @method render
    */
    render: function(buffer) {
      var containedView = this._containedView, self = this;

      if (containedView && (containedView._state || containedView.state) !== 'inDOM') {
        containedView.triggerRecursively('willInsertElement');
        containedView.renderToBuffer(buffer);
        containedView.transitionTo('inDOM');
        Em.run.schedule('afterRender', function() {
          if(self._containedView) {
            self._containedView.triggerRecursively('didInsertElement');
          }
        });
      }
    }

  });



  Ember.Handlebars.registerHelper('cloaked-horizontal-collection', function(options) {
    var hash = options.hash,
        types = options.hashTypes;

    for (var prop in hash) {
      if (types[prop] === 'ID') {
        hash[prop + 'Binding'] = hash[prop];
        delete hash[prop];
      }
    }
    return Ember.Handlebars.helpers.view.call(this, Ember.CloakedHorizontalCollectionView, options);
  });

})();
