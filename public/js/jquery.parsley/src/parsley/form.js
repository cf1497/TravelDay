import $ from 'jquery';
import ParsleyAbstract from './abstract';
import ParsleyUtils from './utils';

var ParsleyForm = function (element, domOptions, options) {
  this.__class__ = 'ParsleyForm';
  this.__id__ = ParsleyUtils.generateID();

  this.$element = $(element);
  this.domOptions = domOptions;
  this.options = options;
  this.parent = window.Parsley;

  this.fields = [];
  this.validationResult = null;
};

var statusMapping = {pending: null, resolved: true, rejected: false};

ParsleyForm.prototype = {
  onSubmitValidate: function (event) {
    var that = this;

    // This is a Parsley generated submit event, do not validate, do not prevent, simply exit and keep normal behavior
    if (true === event.parsley)
      return;

    // If we didn't come here through a submit button, use the first one in the form
    this._$submitSource = this._$submitSource || this.$element.find('input[type="submit"], button[type="submit"]').first();

    if (this._$submitSource.is('[formnovalidate]')) {
      this._$submitSource = null;
      return;
    }

    // Because some validations might be asynchroneous,
    // we cancel this submit and will fake it after validation.
    event.stopImmediatePropagation();
    event.preventDefault();

    this.whenValidate(undefined, undefined, event)
      .done(function () { that._submit(); })
      .always(function () { that._$submitSource = null; });

    return this;
  },

  onSubmitButton: function(event) {
    this._$submitSource = $(event.target);
  },
  // internal
  // _submit submits the form, this time without going through the validations.
  // Care must be taken to "fake" the actual submit button being clicked.
  _submit: function () {
    if (false === this._trigger('submit'))
      return;
    this.$element.find('.parsley_synthetic_submit_button').remove();
    // Add submit button's data
    if (this._$submitSource) {
      $('<input class="parsley_synthetic_submit_button" type="hidden">')
      .attr('name', this._$submitSource.attr('name'))
      .attr('value', this._$submitSource.attr('value'))
      .appendTo(this.$element);
    }
    //
    this.$element.trigger($.extend($.Event('submit'), {parsley: true}));
  },

  // Performs validation on fields while triggering events.
  // @returns `true` if al validations succeeds, `false`
  // if a failure is immediately detected, or `null`
  // if dependant on a promise.
  // Prefer `whenValidate`.
  validate: function (group, force, event) {
    return statusMapping[ this.whenValidate(group, force, event).state() ];
  },

  whenValidate: function (group, force, event) {
    var that = this;
    this.submitEvent = event;
    this.validationResult = true;

    // fire validate event to eventually modify things before very validation
    this._trigger('validate');

    // Refresh form DOM options and form's fields that could have changed
    this._refreshFields();

    var promises = this._withoutReactualizingFormOptions(function () {
      return $.map(this.fields, function(field) {
        // do not validate a field if not the same as given validation group
        if (!group || that._isFieldInGroup(field, group))
          return field.whenValidate(force);
      });
    });

    var promiseBasedOnValidationResult = function () {
      var r = $.Deferred();
      if (false === that.validationResult)
        r.reject();
      return r.resolve().promise();
    };

    return $.when.apply($, promises)
      .done(  function () { that._trigger('success'); })
      .fail(  function () { that.validationResult = false; that._trigger('error'); })
      .always(function () { that._trigger('validated'); })
      .pipe(  promiseBasedOnValidationResult, promiseBasedOnValidationResult);
  },

  // Iterate over refreshed fields, and stop on first failure.
  // Returns `true` if all fields are valid, `false` if a failure is detected
  // or `null` if the result depends on an unresolved promise.
  // Prefer using `whenValid` instead.
  isValid: function (group, force) {
    return statusMapping[ this.whenValid(group, force).state() ];
  },

  // Iterate over refreshed fields and validate them.
  // Returns a promise.
  // A validation that immediately fails will interrupt the validations.
  whenValid: function (group, force) {
    var that = this;
    this._refreshFields();

    var promises = this._withoutReactualizingFormOptions(function () {
      return $.map(this.fields, function(field) {
        // do not validate a field if not the same as given validation group
        if (!group || that._isFieldInGroup(field, group))
          return field.whenValid(force);
      });
    });
    return $.when.apply($, promises);
  },

  _isFieldInGroup: function (field, group) {
    if ($.isArray(field.options.group))
      return -1 !== $.inArray(group, field.options.group);
    return field.options.group === group;
  },

  _refreshFields: function () {
    return this.actualizeOptions()._bindFields();
  },

  _bindFields: function () {
    var self = this;
    var oldFields = this.fields;

    this.fields = [];
    this.fieldsMappedById = {};

    this._withoutReactualizingFormOptions(function () {
      this.$element
      .find(this.options.inputs)
      .not(this.options.excluded)
      .each(function () {
        var fieldInstance = new window.Parsley.Factory(this, {}, self);

        // Only add valid and not excluded `ParsleyField` and `ParsleyFieldMultiple` children
        if (('ParsleyField' === fieldInstance.__class__ || 'ParsleyFieldMultiple' === fieldInstance.__class__) && (true !== fieldInstance.options.excluded))
          if ('undefined' === typeof self.fieldsMappedById[fieldInstance.__class__ + '-' + fieldInstance.__id__]) {
            self.fieldsMappedById[fieldInstance.__class__ + '-' + fieldInstance.__id__] = fieldInstance;
            self.fields.push(fieldInstance);
          }
      });

      $(oldFields).not(self.fields).each(function () {
        this._trigger('reset');
      });
    });
    return this;
  },

  // Internal only.
  // Looping on a form's fields to do validation or similar
  // will trigger reactualizing options on all of them, which
  // in turn will reactualize the form's options.
  // To avoid calling actualizeOptions so many times on the form
  // for nothing, _withoutReactualizingFormOptions temporarily disables
  // the method actualizeOptions on this form while `fn` is called.
  _withoutReactualizingFormOptions: function (fn) {
    var oldActualizeOptions = this.actualizeOptions;
    this.actualizeOptions = function () { return this; };
    var result = fn.call(this); // Keep the current `this`.
    this.actualizeOptions = oldActualizeOptions;
    return result;
  },

  // Internal only.
  // Shortcut to trigger an event
  // Returns true iff event is not interrupted and default not prevented.
  _trigger: function (eventName) {
    return this.trigger('form:' + eventName);
  }

};

export default ParsleyForm;
