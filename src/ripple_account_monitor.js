const RippleRestClient = require('ripple-rest-client');
const ArgumentError = require('./errors/argument_error.js');

const TIMEOUT = 3000

function RippleAccountMonitor(options) {
  if (!options) {
    throw new ArgumentError('options must be an object');
  }
  if (!options.rippleRestUrl) {
    throw new ArgumentError('options.rippleRestUrl must be a url');
  }
  if (!options.account) {
    throw new ArgumentError('options.account must be a ripple Account');
  }
  if (typeof options.onTransaction != 'function') {
    throw new ArgumentError('options.onTransaction(transaction, next) must be a function');
  }
  this.rippleRestClient = new RippleRestClient({
    api: options.rippleRestUrl,
    account: options.account,
    secret: ''
  });
  this.lastHash = options.lastHash;
  this.timeout = options.timeout || 5000;
  this.onTransaction = options.onTransaction;
  this.onPayment = options.onPayment;
  this.onTrustSet = options.onTrustSet;
  this.onAccountSet = options.onAccountSet;
  this.onOfferCreate = options.onOfferCreate;
  this.onOfferCancel = options.onOfferCancel;
  this.onSetRegularKey = options.onSetRegularKey;
  this.onError = options.onError || function(error) {
    console.log('RippleAccountMonitor::Error', error);
  };
}

RippleAccountMonitor.prototype = {

  start: function() {
    var _this = this;
    if (_this.lastHash) {
      _this._processNextTransaction();
    } else {
      // get the most recent hash, then:
      // _this._processNextTransaction();
    }
  },

  stop: function() {
  },
  
  _loop: function(timeout) {
    var _this = this;
    if (timeout) {
      setTimeout(_this._processNextTransaction.bind(_this), timeout);
    } else {
      setImmediate(_this._processNextTransaction.bind(_this));
    }   
  },

  _getNextTransaction: function(callback) {
    var _this = this;
    _this.rippleRestClient.getNotification(_this.lastHash, function(error, notification) {
      if (error) {
        _this.onError(error);
        return callback(error);
      }
      if (!notification) {
        return callback();
      }
      _this.rippleRestClient.getNotification(_this.lastHash, function(error, notification) {
        if (error) {
          _this.onError(error);
          return callback(error);
        }
        if (!notification) {
          return callback();
        }
        if (notification.next_notification_hash) {
          return _this.rippleRestClient.getTransaction(notification.next_notification_hash, function(error, response) {
            if (error) {
              _this.onError(error);
              return callback(error);
            }
            if (!response) {
              callback();
            } else {
              callback(null, response.transaction);
            }
          });
        } else {
          return callback();
        }
      });
    });
  },
  
  _processNextTransaction: function() {
    var _this = this;
    _this._getNextTransaction(function(error, transaction) {
      if (error) {
        _this.onError(error);
        return _this._loop(_this.timeout);
      } 
      if (!transaction) {
        return _this._loop(_this.timeout);
      }
      var hook = _this.onTransaction; 
      switch(transaction.TransactionType) {
        case 'Payment':
          if (typeof _this.onPayment === 'function') { hook = _this.onPayment }
          break;
        case 'TrustSet':
          if (typeof _this.onTrustSet === 'function') { hook = _this.onTrustSet }
          break;
        case 'AccountSet':
          if (typeof _this.onAccountSet === 'function') { hook = _this.onAccountSet }
          break;
        case 'OfferCreate':
          if (typeof _this.onOfferCreate === 'function') { hook = _this.onOfferCreate }
          break;
        case 'OfferCancel':
          if (typeof _this.onOfferCancel === 'function') { hook = _this.onOfferCancel }
          break;
        case 'SetRegularKey':
          if (typeof _this.onSetRegularKey === 'function') { hook = _this.onSetRegularKey }
          break;
        default:
      }
      hook(transaction,
        function() { // advance
          process.nextTick(function() {
            _this.lastHash = transaction.hash;
            _this._loop();
          })
        },
        function(timeout) { // retry
          setTimeout(function() {
            process.nextTick(function() {
              _this._loop()
            })
          }, timeout || TIMEOUT)
        }
      )
    }.bind(_this));
  }
}

module.exports = RippleAccountMonitor;

