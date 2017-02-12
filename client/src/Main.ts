import { SyncNode, SyncData } from "./SyncNode/SyncNode";
import { SyncView, SyncApp, SyncList, SyncUtils } from "./SyncNode/SyncView";
import * as moment from "./node_modules/moment/moment";

interface RMSData extends SyncData {
    schedules: Schedule;
}

interface Schedule extends SyncData {
    weeks: {[key: string]: Week};
}

interface Week extends SyncData {
    startDate: string;
    note: string;
    days: {[key: string]: Day};
}

interface Day extends SyncData {
    startDate: string;
    note: string;
    shifts: {[key: string]: Shift};
}

interface EmployeeShifts extends SyncData {
    //name: string; // we'll use the key as the name
    shifts: {[key: string]: Shift};
}

interface Shift extends SyncData {
    area: string;
    position: string;
    name: string;
    clockIn: string;
    clockOut: string;
    note: string;
    isDisabled: boolean;
    sortOrder: number;
}

// Wrapper to introduce a temporary key because unfortunately existing Shifts use the employee key as the key,
// which is not unique among Shifts and SyncList needs a unique key to track items correctly. 
interface ShiftWrapper extends SyncData {
    shift: Shift;
}

class ShiftView extends SyncView<ShiftWrapper> {
    area = this.append<HTMLSpanElement>({ tag: "span", style: { display: "inline-block", width: "75px" }});
    position = this.append<HTMLSpanElement>({ tag: "span", style: { display: "inline-block", width: "100px" }});
    name = this.append<HTMLSpanElement>({ tag: "span", style: { display: "inline-block", width: "150px" }});
    day = this.append<HTMLSpanElement>({ tag: "span", style: { display: "inline-block", width: "100px" }});
    hours = this.append<HTMLSpanElement>({ tag: "span", style: { display: "inline-block", width: "75px" }});
    clockIn = this.append<HTMLSpanElement>({ tag: "span", style: { display: "inline-block", width: "75px" }});
    clockOut = this.append<HTMLSpanElement>({ tag: "span", style: { display: "inline-block", width: "75px" }});
    duration() {
        let shift = this.data.shift;
		if(!shift.clockOut) return 0;
		var dur = moment.duration(moment(shift.clockOut).diff(moment(shift.clockIn)));
		return Math.round(dur.asHours() * 100) / 100;
	}
    render() {
        let shift = this.data.shift;
        this.area.innerHTML = shift.area;
        this.position.innerHTML = shift.position;
        this.name.innerHTML = shift.name;
        this.day.innerHTML = shift.clockIn ? moment(shift.clockIn).format("dddd") : "";
        this.clockIn.innerHTML = shift.clockIn ? moment(shift.clockIn).format("hh:mma") : "";
        this.clockOut.innerHTML = shift.clockOut ? moment(shift.clockOut).format("hh:mma") : "";
        let duration = this.duration();
        this.hours.innerHTML = duration ? (duration).toFixed(2) : "";
        this.hours.style.color = duration > 9 ? "#F00" : "#0C0";
    }
}

class DayView extends SyncView<Day> {
    title = this.append<HTMLParagraphElement>({ tag: "p" });
    list = this.appendView(new SyncList({ item: ShiftView, sortField: "startDate", style: { marginTop: "1em" }}));
    render() {
        this.title.innerHTML = moment(this.data.startDate).format("dddd");
        this.list.update(this.data.shifts as SyncData);
    }
}



class ByEmployeeView extends SyncView<EmployeeShifts> {
    s = this.style({ marginLeft: "2em" });
    name = this.append<HTMLHeadElement>({ tag: "h4" });
    list = this.appendView(new SyncList({ item: ShiftView, sortField: "shift.clockIn", style: { marginTop: "1em" }}));
    render() {
        this.name.innerHTML = this.data.key;
        this.list.update(this.data.shifts as SyncData);
    }
}

class WeekView extends SyncView<Week> {
    s = this.style({ width: "100%" })
    text = this.append<HTMLHeadElement>({ tag: "h3" });
    //list = this.appendView(new SyncList({ item: DayView, sortField: "startDate", style: { marginTop: "1em" }}));
    list = this.appendView(new SyncList({ item: ByEmployeeView, sortField: "key", style: { marginTop: "1em" }}));
    render() {
        this.text.innerHTML = moment(this.data.startDate).format("dddd MMM Do YYYY");
        let grouped: {[key: string]: any} = {};
        SyncUtils.forEach(this.data.days, (day: Day) => {
            SyncUtils.forEach(day.shifts, (shift: Shift) => {
                if(shift.name.trim() !== "") {
                    if(!grouped[shift.name]) grouped[shift.name] = { key: shift.name, shifts: {}};
                    let tempKey = SyncNode.guidShort();
                    grouped[shift.name].shifts[tempKey] = { key: tempKey, shift: shift };
                }
            });
        });
        console.log("grouped", grouped);
        this.list.update(grouped as any);
    }
}

class WeeksView extends SyncView<Schedule> {
    s = this.style({ width: "100%" })
    title = this.append({ tag: "h1", innerHTML: "Payroll", style: { color: "#009" }});
    list = this.appendView(new SyncList({ item: WeekView, sortField: "startDate", sortReversed: true, style: { marginTop: "1em" }}));
    render() {
        let filtered = SyncUtils.filterMap(this.data.weeks, (week: Week): boolean => { 
            return moment(week.startDate).isBefore(moment().subtract(1, "week")) && moment(week.startDate).isAfter(moment().subtract(2, "week"));;
        });
        this.list.update(filtered as SyncData);
    }
}

class MainView extends SyncView<RMSData> {
    list = this.appendView(new WeeksView());

    render() {
        this.list.update(this.data.schedules);
    }
}





let app = new SyncApp(new MainView());
app.start();


