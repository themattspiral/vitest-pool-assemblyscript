// User objects with container fields for deep equality testing

import { Person, Point, Shape } from './user-class-utils';

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

export class Scoreboard {
  name: string;
  scores: Array<i32>;

  constructor(name: string, scores: Array<i32>) {
    this.name = name;
    this.scores = scores;
  }
}

export class Settings {
  label: string;
  config: Map<string, i32>;

  constructor(label: string, config: Map<string, i32>) {
    this.label = label;
    this.config = config;
  }
}

export class ShapeList {
  label: string;
  shapes: Array<Shape>;

  constructor(label: string, shapes: Array<Shape>) {
    this.label = label;
    this.shapes = shapes;
  }
}

export class ShapeRegistry {
  label: string;
  shapes: Map<string, Shape>;

  constructor(label: string, shapes: Map<string, Shape>) {
    this.label = label;
    this.shapes = shapes;
  }
}

export class ShapeGroup {
  label: string;
  shapes: Set<Shape>;

  constructor(label: string, shapes: Set<Shape>) {
    this.label = label;
    this.shapes = shapes;
  }
}
