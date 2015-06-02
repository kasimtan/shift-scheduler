angular.module('SchedulerApp', ['ngRoute'])

/**
 * Routing configuration
 */
.config(function ($routeProvider) {
  $routeProvider
  	.when('/', {
	  controller: 'HomeController',
      templateUrl: 'views/home.html'
    })
    .when('/employee/:id', {
	  controller: 'EmployeeController',
      templateUrl: 'views/employee.html'
    })
    .otherwise({
      redirectTo: '/'
    });
})

/**
 * Retrieve employees
 */
.factory('employees', function($http) {
  return $http.get('data/employees.json')
    .success(function(data) {
      return data;
    })
    .error(function(err) {
      return err;
    });
})

/**
 * Retrieve rules
 */
.factory('rules', function($http) {
  return $http.get('data/rule-definitions.json')
    .success(function(data) {
      return data;
    })
    .error(function(err) {
      return err;
    });
})

/**
 * Retrieve shift rules
 */
.factory('shiftRules', function($http) {
  return $http.get('data/shift-rules.json')
    .success(function(data) {
      return data;
    })
    .error(function(err) {
      return err;
    });
})

/**
 * Retrieve time-off requests
 */
.factory('timeOff', function($http) {
  return $http.get('data/time-off-requests.json')
    .success(function(data) {
      return data;
    })
    .error(function(err) {
      return err;
    });
})

/**
 * Main algorithm of scheduler
 */
.service('scheduler', function() {

  /* private properties */
  var employeeList = [];
  var ruleList = [];
  var shiftRuleList = [];
  var timeOffList = [];

  /* private methods */
  var _getMinEmployeesPerShift = function() {
    // get ruleId for EMPLOYEES_PER_SHIFT rule
    var rule = ruleList.filter(
      function(data) {
        return data.value == "EMPLOYEES_PER_SHIFT";
      }
    );
    var ruleId = (rule.length > 0) ? rule[0].id : 0;
    // get the minimum/ideal number of employees per shift
    var shiftRule = shiftRuleList.filter(
      function(data) {
        return data.rule_id == ruleId;
      }
    );
    return (shiftRule.length > 0) ? shiftRule[0].value : 0;
  };

  var _getEmployeeTimeOffSchedule = function(startWeek, endWeek) {
    var employeeTimeOff = {};
    for (var i = 0; i < timeOffList.length; i++) {
      var timeOff = timeOffList[i];
      var week = timeOff.week;
      if (week >= startWeek && week <= endWeek) {
        var employeeId = timeOff.employee_id;
        if (employeeTimeOff[week] == null) {
          employeeTimeOff[week] = {};
        }
        if (employeeTimeOff[week][employeeId] == null) {
          employeeTimeOff[week][employeeId] = timeOff.days;
        }
        else {
          $.merge(employeeTimeOff[week][employeeId], timeOff.days);
          timeOff.days = [];
        }
      }
    }
    return employeeTimeOff;
  };

  var _generateShiftSchedule = function(startWeek, endWeek, employeeSchedule) {
    var schedule = [];
    for (var week = startWeek; week <= endWeek; week++) {
      var schedules = [];
      for (var i = 0; i < employeeList.length; i++) {
        var id = employeeList[i].id;
        schedules.push({
          "employee_id": id,
          "schedule": (employeeSchedule[id][week] ? employeeSchedule[id][week].sort() : employeeSchedule[id][week])
        });
      }
      schedule.push({"week": week, "schedules": schedules});
    }
    return schedule;
  };

  /* public methods */
  this.setEmployees = function(data) {
    employeeList = data;
  };

  this.setRules = function(data) {
    ruleList = data;
  };

  this.setShiftRules = function(data) {
    shiftRuleList = data;
  };

  this.setTimeOffs = function(data) {
    timeOffList = data;
  };

  // Simply implement the EMPLOYEES_PER_SHIFT rule (ignore time off requests)
  this.getSchedule1 = function(startWeek, endWeek) {
    // initialization
    var employeeIds = [];
    var continuousCount = {};
    var employeeSchedule = {};
    var totalEmployees = employeeList.length;
    for (var i = 0; i < totalEmployees; i++) {
      var employeeId = employeeList[i].id;
      employeeIds.push(employeeId);
      employeeSchedule[employeeId] = {};
      continuousCount[employeeId] = 0;
      for (var j = startWeek; j <= endWeek; j++) {
        employeeSchedule[employeeId][j] = [];
      }
    }

    // get shift quota
    var minEmployeesPerShift = _getMinEmployeesPerShift();

    // calculate minimum continuous shifts required per each employee
    var minShiftsPerEmployee = (totalEmployees > 0) ?
        Math.ceil(minEmployeesPerShift * 7 / totalEmployees) : 0;

    // assigning each employee day-by-day with round-robin algorithm
    // until reached minimum/ideal number of employees per day
    var day = 1;
    var employeeIndex = 0;
    var assignIndex = 0;
    var week = startWeek;
    if (minShiftsPerEmployee > 0) {
      while (week <= endWeek) {
        var id = employeeIds[employeeIndex];
        // assign a shift to this employee if previously not assigned yet
        if ($.inArray(day, employeeSchedule[id][week]) == -1) {
          employeeSchedule[id][week].push(day);
          // increment count
          continuousCount[id]++;
          // move to the next employee if continuous shifts reached
          if (continuousCount[id] == minShiftsPerEmployee) {
            // reset count
            continuousCount[id] = 0;
            // move to the next employee
            employeeIndex++;
            if (employeeIndex == totalEmployees) {
              // just in case no more employees to assign, then reset
              employeeIndex = 0;
            }
          }
        }
        // move to next day
        day++;
        if (day > 7) {
          // reset day of week
          day = 1;
          // next round of assignment
          assignIndex++;
        }
        // shift quota reached
        if (assignIndex == minEmployeesPerShift) {
          // move to next week
          week++;
          // reset quota counter
          assignIndex = 0;
        }
      }
    }

    // return shift schedule data
    return _generateShiftSchedule(startWeek, endWeek, employeeSchedule);
  };

  // Take into account employee time off for EMPLOYEES_PER_SHIFT rule
  this.getSchedule2 = function(startWeek, endWeek) {
    // initialization
    var employeeIds = [];
    var continuousCount = {};
    var employeeSchedule = {};
    var totalEmployees = employeeList.length;
    for (var i = 0; i < totalEmployees; i++) {
      var employeeId = employeeList[i].id;
      employeeIds.push(employeeId);
      employeeSchedule[employeeId] = {};
      continuousCount[employeeId] = 0;
      for (var j = startWeek; j <= endWeek; j++) {
        employeeSchedule[employeeId][j] = [];
      }
    }

    // get shift quota
    var minEmployeesPerShift = _getMinEmployeesPerShift();

    // calculate minimum continuous shifts required per each employee
    var minShiftsPerEmployee = (totalEmployees > 0) ?
        Math.ceil(minEmployeesPerShift * 7 / totalEmployees) : 0;

    // get time off schedule
    var timeOff = _getEmployeeTimeOffSchedule(startWeek, endWeek);

    // assigning each day minimum required employees
    if (minShiftsPerEmployee > 0) {
      for (var week = startWeek; week <= endWeek; week++) {
        var weekDayCount = {};
        if (weekDayCount[week] == null) {
          weekDayCount[week] = {};
        }
        // with priority to ones that have time off requests for that week
        var timeOffEmployee = timeOff[week];
        for (id in timeOffEmployee) {
          if ($.inArray(parseInt(id), employeeIds) == -1) {
            // time off employee not in employee list, bail
            continue;
          }
          for (var day = 1; day <= 7; day++) {
            // assign an employee for those 'available' days that has no time offs
            if ($.inArray(day, timeOff[week][id]) == -1 &&
                (weekDayCount[week][day] == null || weekDayCount[week][day] < minEmployeesPerShift)) {
              employeeSchedule[id][week].push(day);
              // increment count
              weekDayCount[week][day] = (weekDayCount[week][day] == null) ? 1 : (weekDayCount[week][day] + 1);
              // move to the next employee if reached minimum weekly shifts or minimum/ideal number of employees of that day
              if (employeeSchedule[id][week].length == minShiftsPerEmployee) {
                break;
              }
            }
          }
        }
        // fill in other empty spots with round-robin algorithm
        // until reached minimum/ideal number of employees per day
        for (day = 1; day <= 7; day++) {
          // with priority to ones that still no employee assigned yet
          if (weekDayCount[week][day] == null) {
            for (employeeIndex = 0; employeeIndex < employeeIds.length; employeeIndex++) {
              id = employeeIds[employeeIndex];
              // skip time off employees or those has reached minimum weekly shifts
              if (timeOff[week] != null && timeOff[week][id] != null) {
                continue;
              }
              else if (weekDayCount[week][day] == minEmployeesPerShift) {
                // stop if reached minimum/ideal number of employees of that day
                break;
              }
              // assign a shift to this employee if previously not assigned yet
              if ($.inArray(day, employeeSchedule[id][week]) == -1) {
                employeeSchedule[id][week].push(day);
                // increment count
                if (weekDayCount[week] == null) {
                  weekDayCount[week] = {};
                }
                weekDayCount[week][day] = (weekDayCount[week][day] == null) ? 1 : (weekDayCount[week][day] + 1);
              }
            }
          }
        }
        // then the rest
        for (day = 1; day <= 7; day++) {
          // with priority to ones that still no employee assigned yet
          if (weekDayCount[week][day] < minEmployeesPerShift) {
            for (var employeeIndex = 0; employeeIndex < employeeIds.length; employeeIndex++) {
              var id = employeeIds[employeeIndex];
              // skip time off employees or those has reached minimum weekly shifts
              if ((timeOff[week] && timeOff[week][id] != null) || employeeSchedule[id][week].length == minShiftsPerEmployee) {
                continue;
              }
              else if (weekDayCount[week][day] == minEmployeesPerShift) {
                // stop if reached minimum/ideal number of employees of that day
                break;
              }
              // assign a shift to this employee if previously not assigned yet
              if ($.inArray(day, employeeSchedule[id][week]) == -1) {
                employeeSchedule[id][week].push(day);
                // increment count
                if (weekDayCount[week] == null) {
                  weekDayCount[week] = {};
                }
                weekDayCount[week][day] = (weekDayCount[week][day] == null) ? 1 : (weekDayCount[week][day] + 1);
              }
            }
          }
        }
      }
    }

    // return shift schedule data
    return _generateShiftSchedule(startWeek, endWeek, employeeSchedule);
  };

  // Implement the MAX_SHIFTS rule applying the corporate setting and ignore employee specific settings
  this.getSchedule3 = function(startWeek, endWeek) {

  };

  // Implement the employee specific MAX_SHIFTS override
  this.getSchedule4 = function(startWeek, endWeek) {

  };

  // Implement the MIN_SHIFTS rule applying the corporate setting and ignore employee specific settings
  this.getSchedule5 = function(startWeek, endWeek) {

  };

  // Implement the employee specific MIN_SHIFTS override
  this.getSchedule6 = function(startWeek, endWeek) {

  };
})

/**
 * Home page controller
 */
.controller('HomeController',
      function($scope, employees) {
  employees.success(function(data) {
    $scope.employees = data;
  });
  $scope.showEmployeeShift = function(index) {
    window.location = '#/employee/'+index;
  };
})

/**
 * Employee's schedule page controller
 */
.controller('EmployeeController',
      function($scope, $q, employees, rules, shiftRules, timeOff, scheduler, $routeParams) {
  employees.success(function(data) {
    scheduler.setEmployees(data);
    $scope.employee = data.filter(
      function(data) {
        return data.id == $routeParams.id;
      }
    )[0];
  });
  rules.success(function(data) {
    scheduler.setRules(data);
  });
  shiftRules.success(function(data) {
    scheduler.setShiftRules(data);
  });
  timeOff.success(function(data) {
    scheduler.setTimeOffs(data);
    $scope.timeOffSchedule = data;
  });
  $scope.startWeek = 23;
  $scope.endWeek = 26;
  $scope.weeks = [];
  for (var week = $scope.startWeek; week <= $scope.endWeek; week++) {
    $scope.weeks.push(week);
  }
  $scope.isConsiderTimeOff = false;
  $scope.switchSchedule = function() {
    $scope.isConsiderTimeOff = !$scope.isConsiderTimeOff;
    if ($scope.isConsiderTimeOff) {
      _convertTimeOff();
      _applySchedule2();
    }
    else {
      _applySchedule1();
    }
    _convertSchedule();
  };
  var _convertTimeOff = function() {
    var timeOffs = [];
    for (var week = $scope.startWeek; week <= $scope.endWeek; week++) {
      var weekSchedule = $scope.timeOffSchedule.filter(
        function(data) {
          return data.employee_id == $scope.employee.id && data.week == week;
        }
      );
      if (weekSchedule.length > 0) {
        var days = [];
        for (var i = 0; i < weekSchedule.length; i++) {
          $.merge(days, weekSchedule[i].days);
        }
        var timeOff = {
          "week": week,
          "days": _convertDayOfWeek(days.sort())
        };
        timeOffs.push(timeOff);
      }
    }
    $scope.timeOffs = timeOffs;
  };
  var _convertSchedule = function() {
    var schedules = [];
    for (var i = 0; i < $scope.shiftSchedule.length; i++) {
      var mySchedule = $scope.shiftSchedule[i].schedules.filter(
        function(data) {
          return data.employee_id == $scope.employee.id;
        }
      );
      var days = [];
      if (mySchedule.length > 0) {
        days = mySchedule[0].schedule;
      }
      var schedule = {
        "week": $scope.shiftSchedule[i].week,
        "days": (days.length > 0) ? _convertDayOfWeek(days) : "N/A"
      };
      schedules.push(schedule);
    }
    $scope.schedules = schedules;
  };
  var _convertDayOfWeek = function(dayOfWeekArray) {
    if (!angular.isArray(dayOfWeekArray)) {
      return dayOfWeekArray;
    }
    var str = [];
    for (var i = 0; i < dayOfWeekArray.length; i++) {
      switch (dayOfWeekArray[i]) {
        case 1:
          str.push("Monday");
          break;
        case 2:
          str.push("Tuesday");
          break;
        case 3:
          str.push("Wednesday");
          break;
        case 4:
          str.push("Thursday");
          break;
        case 5:
          str.push("Friday");
          break;
        case 6:
          str.push("Saturday");
          break;
        case 7:
          str.push("Sunday");
          break;
        default:
          break;
      }
    }
    return str.join(", ");
  };
  var _applySchedule1 = function() {
    $scope.shiftSchedule = scheduler.getSchedule1($scope.startWeek, $scope.endWeek);
  };
  var _applySchedule2 = function() {
    $scope.shiftSchedule = scheduler.getSchedule2($scope.startWeek, $scope.endWeek);
  };
  var _applySchedule3 = function() {
    $scope.shiftSchedule = scheduler.getSchedule3($scope.startWeek, $scope.endWeek);
  };
  var _applySchedule4 = function() {
    $scope.shiftSchedule = scheduler.getSchedule4($scope.startWeek, $scope.endWeek);
  };
  var _applySchedule5 = function() {
    $scope.shiftSchedule = scheduler.getSchedule5($scope.startWeek, $scope.endWeek);
  };
  var _applySchedule6 = function() {
    $scope.shiftSchedule = scheduler.getSchedule6($scope.startWeek, $scope.endWeek);
  };
  // trigger default scheduling calculation
  $q.all([employees, rules, shiftRules, timeOff]).then(function() {
      _applySchedule1();
      _convertSchedule();
  });
});