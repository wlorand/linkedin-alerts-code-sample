/**
 * li-alerts.js: Linked In Alerts JS Code Assembled (Backbone / Marionette) 
 *
 * List of JS Modules assembled here: (uses AMD modules, RequireJS) 
 *    1-  Widget.js -- widget starting point
 *  
 *    2a- ./entities/Entities.js 
 *    2b- ./entities/AlertsCollection.js
 *    2c- ./entities/AlertModel.js
 *    2d- ./entities/DismissedAlertsCollection.js
 *
 *    3- ./controllers/MainController.js 
 *
 *    4a- ./views/LayoutView.js
 *    4b- ./views/AlertsCollectionView.js
 *    4c- ./views/AlertItemView.js
 *
 */

/***************************************************************
 * 1- Widget.js -- widget starting point 
 ***************************************************************/
 define([
    'require',
    'app',
    'com',
    './controllers/MainController',
    './entities/Entities',
    './views/LayoutView',
    'json!./widget.json',
    'css!./style.css'
  ],
  function(require, App, Radio, MainController, Entities, LayoutView, config) {

    'use strict';

    // pre-initialize communication layer
    var channels = {
      global: Radio.global,
      local: Radio.local(config.widgetName)
    };

    // pre-initialize layout.
    var layout = new LayoutView();

    // Declare the new module, and attach it to the solution.
    var Widget = App.module(config.widgetName, function(self, App, Backbone, Marionette, $, _) {

      // prevent widget from starting automatically.
      self.startWithParent = false;

      self.Router = Marionette.AppRouter.extend({
        appRoutes: {
          '': 'index'
        }
      });

      // entry point of the widget
      self.on('start', function() {
        // initializing main controller
        self.controller = new MainController();

        // initializing widget router with controller
        var router = new self.Router({
          controller: self.controller
        });

        // manually triggering index route on controller
        self.controller.index();
      });

    });

    // Hooks
    channels.local.reply('entities', function(name, data, options) {
      return new Entities[name](data, options);
    });
    channels.local.reply('layout', function() {
      return layout;
    });

    //Register our new subApp once the App is ready.
    App.ready.done(function() {
      // widget is requesting the App to register itself and render layout.
      channels.global.command('startWidget', Widget, layout);
    });

    return Widget;
  });

/***************************************************************
 * 2a- ./entities/Entities.js 
 ***************************************************************/

define([
  'base/BaseEntityManager',
  './AlertsCollection',
  './DismissedAlertsCollection',
  'json!../widget.json'
], function(BaseEntityManager, AlertsCollection, DismissedAlertsCollection, config) {

  'use strict';

  var Entities = BaseEntityManager.extend({

    widgetName: config.widgetName,
    consumerKey: config.consumerKey,
    entities: {
      'AlertsCollection' : AlertsCollection,
      'DismissedAlertsCollection': DismissedAlertsCollection
    }

  });

  var entityManager = new Entities();

  return entityManager.entities;

});


/***************************************************************
 * 2b- ./entities/AlertsCollection.js 
 ***************************************************************/

define([
  'require',
  'base/BaseCollection',
  './AlertModel'
], function(require, BaseCollection, AlertModel) {

  'use strict';

  var AlertsCollection = BaseCollection.extend({
    model: AlertModel,
    url: '/lips/api/proxy/alerts_widget/api/v2/alerts',
    parse: function(response, options){
      return response.alerts;
    },
    contains: function(model) {
      return this.get(model) && this.get(model).get('version') === model.get('version');
    }
  });

  return AlertsCollection;

});

/***************************************************************
 * 2c- ./entities/AlertModel.js
 ***************************************************************/

define([
  'require',
  'base/BaseModel'
], function(require, BaseModel) {

  'use strict';

  var AlertModel = BaseModel.extend({

    defaults: {
      'id': '',
      'message': '',
      'link': '',
      'severity': '',
      'version': '',
      'start': '',
      'end': '',
      'destinations': [{
        'display_name': '',
        'address': ''
      }]
    }
  });

  return AlertModel;

});

/***************************************************************
 * 2d- /entities/DismissedAlertsCollection.js
   - uses local storage to track alerts dismissed by the user
 ***************************************************************/

define([
  'require',
  'backbone',
  './AlertModel',
  'backbone.localStorage'
], function(require, Backbone, AlertModel) {

  'use strict';
  var DismissedAlertsCollection = Backbone.Collection.extend({
    model: AlertModel,
    localStorage: new Backbone.LocalStorage("DismissedAlerts"),
    contains: function(model) {
      return this.get(model) && this.get(model).get('version') === model.get('version');
    }
  });

  return DismissedAlertsCollection;

});

/***************************************************************
 * 3- ./controllers/MainController.js
 ***************************************************************/

define([
  'base/BaseController',
  '../views/AlertsCollectionView'
], function (BaseController, AlertsCollectionView) {

  'use strict';

  var MainController = BaseController.extend({

    widgetName: 'AlertsWidget',

    _pollAlerts: function(collection, freq) {
      collection.fetch();
      return setTimeout(this._pollAlerts.bind(this, collection, freq), freq);
    },
    index: function () {
      var alertsCollection = this.channels.local.request('entities','AlertsCollection');

      var dismissedAlertsCollection = this.channels.local.request('entities','DismissedAlertsCollection');
      dismissedAlertsCollection.fetch();

      var alertsCollectionView  = new AlertsCollectionView({
        collection: alertsCollection,
        filter: function (model) {
          return !dismissedAlertsCollection.contains(model);
        }
      });

      var self = this;
      var alertsFetching = alertsCollection.fetch();
      $.when(alertsFetching).done(function(){
        self.layout.bodyRegion.show(alertsCollectionView);
        self._pollAlerts(alertsCollection, 60000);
      });

      alertsCollection.on('sync', function(collection){
        dismissedAlertsCollection.chain()
            .filter(function (dismissedAlert){
              return !collection.contains(dismissedAlert);
            })
            .invoke('destroy').values();
      });

      alertsCollectionView.on("childview:destroy", function(itemView){
        dismissedAlertsCollection.add(itemView.model.clone()).save();
      });

    }
  });

  return MainController;

});

/***************************************************************
 * 4a- ./views/LayoutView.js
 ***************************************************************/

define([
  'backbone.marionette',
  'dust!../templates/layout'
], function(Marionette) {

  'use strict';

  var AlertsWidgetLayout = Marionette.LayoutView.extend({

    // tagname: if not here, will be a div
    className: 'js-layoutView',
    template: 'app/widgets/alertsWidget/templates/layout', // .tl

    regions: {
      bodyRegion: '.region__body' 
    }

  });

  return AlertsWidgetLayout;

});

/***************************************************************
 * 4b- ./views/AlertsCollectionView.js
 ***************************************************************/

define([
    'require',
    'backbone.marionette',
    './AlertItemView'
  ],
  function (require, Marionette, AlertItemView) {

    'use strict';

    var AlertsCollectionView = Marionette.CollectionView.extend({

      tagName: 'ul',
      className: 'js-alertsCollectionView',
      childView: AlertItemView,
    });

    return AlertsCollectionView;

  });

/***************************************************************
 * 4c- ./views/AlertItemView.js
 ***************************************************************/

 define([
  'require',
  'backbone.marionette',
  'dust!../templates/alert'
], function(require, Marionette) {

  'use strict';

  var AlertView = Marionette.ItemView.extend({
    tagName: 'li',
    className: 'js-alertView animated slideInLeft',
    template: 'app/widgets/alertsWidget/templates/alert',
    ui: {
      'dismissBtn': '#js-alert-dismiss',
      'alertLink' : '#js-alert__link'
    },
    events: {
      'click @ui.dismissBtn': 'dismiss' // event handler
    },
    modelEvents: {
      'change': 'render'
    },
    dismiss: function(){
      this.$el.removeClass('slideInLeft');
      this.$el.addClass('slideOutRight');
      var self = this;
      setTimeout( function(){ self.destroy(); }, 1000); // destroy the view
    }
  });

  return AlertView;
});
