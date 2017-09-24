var objects = [];
var id = 0;

module.exports = {
    start: function () {
        objects[id] = process.hrtime();
        return id++;
    },
    end: function (id) {
        var time = process.hrtime(objects[id]);
        var millis = time[1] / 1000000 + time[0] * 1000;
        return (millis * 1000 | 0) / 1000;
    },
    endPrecise: function (id) {
        var time = process.hrtime(objects[id]);
        return time[1] / 1000000 + time[0] * 1000;
    },
    round: function (preciseDuration) {
        return (preciseDuration * 1000 | 0) / 1000;
    }
};