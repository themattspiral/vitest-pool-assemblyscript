// User objects with container fields types to user objects

import { Person, Point } from './user-class-utils';

export class Team {
  teamName: string;
  members: Array<Person>;

  constructor(teamName: string, members: Array<Person>) {
    this.teamName = teamName;
    this.members = members;
  }
}

export class Registry {
  entries: Map<string, Point>;

  constructor(entries: Map<string, Point>) {
    this.entries = entries;
  }
}

export class PointGroup {
  points: Set<Point>;

  constructor(points: Set<Point>) {
    this.points = points;
  }
}
