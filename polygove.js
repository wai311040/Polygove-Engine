class Manager {

    constructor() {
        this.m_is_started = false;
        this.m_type = "Manager";
    }

    // Set type identifier of Manager.
    setType(type) {
        this.m_type = type;
    }

    // Get type identifier of Manager.
    getType() {
        return this.m_type;
    }

    // Startup Manager.
    // Return 0 if ok.
    startUp() {
        this.m_is_started = true;
        return 0;
    }

    // Shutdown Manager.
    shutDown() {
        this.m_is_started = false;
    }

    // Return true when startUp() was executed ok, else false.
    isStarted() {
        return this.m_is_started;
    }
}

class LogManager extends Manager {
    constructor() {
        if (!LogManager.instance) {
            super();
            LogManager.instance = this;
        }

        return LogManager.instance;
    }

    // Start up the LogManager.
    startUp() {
        if (!this.isStarted()) {
            if (super.startUp() == 0) {
                return 0;
            }
        }
        return -1;
    }

    // Shut down the LogManager.
    shutDown() {
        super.shutDown();
    }

    // Write to log.
    writeLog(message) {
        if (this.isStarted()) {
            console.log(message);
        }
    }
}

class GameManager extends Manager {

    LM = new LogManager();
    IM = new InputManager();
    DM = new DisplayManager();
    WM = new WorldManager();

    constructor() {
        if (!GameManager.instance) {
            super();
            this.setType("GameManager");
            this.game_over = true;				// True, then game loop should stop.
            this.frame_time = 33;				// Target time per game loop, in milliseconds.
            GameManager.instance = this;
        }

        return GameManager.instance;
    }

    // Startup all GameManager services.
    startUp() {
        if (!this.isStarted()) {
            //startup it self
            if (super.startUp() == 0) {
                // startup other managers
                this.LM.startUp(); 		// LogManager first
                this.DM.startUp();
                this.IM.startUp();
                this.WM.startUp();

                //ready to run game loop
                this.setGameOver(false);
                return 0;
            }
        }
        return -1;
    }

    // Shut down GameManager services.
    shutDown() {
        //stop game loop by setting game to over
        this.setGameOver(true);

        //shutdown other managers
        this.WM.shutDown();
        this.IM.shutDown();
        this.DM.shutDown();
        this.LM.shutDown(); //LogManager last

        //shut down itself
        super.shutDown();
    }

    // Run game loop.
    async run() {
        var clock = new Clock();
        var loop_time, intended_sleep_time, adjust_time, actual_sleep_time;
        adjust_time = 0;
        var game_loop_count = 0;

        for (;!this.getGameOver();) {
            clock.delta();

            // // Get input e.g., keyboard/mouse
            this.IM.getInput();

            // Update game world state
            // Send step event to all objects.
            if (game_loop_count % 10 == 0) {
                var s = new EventStep(game_loop_count);
                WM.onEvent(s);
            }

            //Update and move objects in World
            this.WM.update();

            // Draw current scene to back buffer
            this.WM.draw();

            game_loop_count++;

            loop_time = clock.split() / 1000;
            intended_sleep_time = this.getFrameTime() - loop_time - adjust_time;
            clock.delta();
            if (intended_sleep_time > 0)
                await new Promise(r => setTimeout(r, intended_sleep_time));

            actual_sleep_time = clock.split() / 1000;
            adjust_time = actual_sleep_time - intended_sleep_time;
            if (adjust_time < 0) {
                adjust_time = 0;
            }
        }
    }

    // Set game over status to indicated value.
    // If true (default), will stop game loop.
    setGameOver(new_game_over) {
        this.game_over = new_game_over;
    }

    // Get game over status.
    getGameOver() {
        return this.game_over;
    }

    // Return frame time.
    // Frame time is target time for game loop, in milliseconds.
    getFrameTime() {
        return this.frame_time;
    }
}

class WorldManager extends Manager {

    constructor() {
        if (!WorldManager.instance) {
            super();
            this.setType("WorldManager");
            this.m_updates = [];
            this.m_deletions = [];
            this.eye_following = null;
            this.at_following = null;
            this.up_following = null;
            WorldManager.instance = this;
        }

        return WorldManager.instance;
    }

    // Startup game world (initialize everything to empty).
    startUp() {
        this.m_updates = [];
        this.m_deletions = [];

        super.startUp();
        return 0;
    }

    // Shutdown game world (delete all game world Objects).
    shutDown() {
        for (var i = 0; i < this.m_deletions.length; i++) {
            this.removeObject(this.m_deletions[i]);
        }
        super.shutDown();
    }

    // Insert GameObject into world. Return 0 if ok, else -1.
    insertObject(p_o) {
        // GameObject might already in list, so only add once.
        if (this.m_updates.includes(p_o)) {
            return -1;
        }

        // GameObject not in list, so add.
        this.m_updates.push(p_o);
        return 0;
    }

    // Remove GameObject from world. Return 0 if ok, else -1.
    removeObject(p_o) {
        if (this.m_updates.includes(p_o)) {
            this.m_updates = utility.arrayRemove(this.m_updates, p_o);
            return 0;
        }
        return -1;
    }

    // Return list of all Objects in world.
    getAllObjects() {
        return this.m_updates;
    }

    // Return list of all Objects in world matching type.
    objectsOfType(type) {
        var type_list = [];
        for (var i = 0; i < this.m_updates.length; i++) {
            if (this.m_updates[i].getType() == type)
                type_list.push(this.m_updates[i]);
        }

        return type_list;
    }

    // Update world.
    // Delete Objects marked for deletion.
    update() {
        // Update object positions based on their velocities.
        // Iterate through all objects.
        for (var i = 0; i < this.m_updates.length; i++) {
            var p_o = this.m_updates[i];
            // predict position of the object in next game loop.
            var new_pos = p_o.predictPosition();
            var moved = false;

            //If GameObject should change position, then move.
            if (new_pos.getX() != p_o.getPosition().getX()
                || new_pos.getY() != p_o.getPosition().getY()
                || new_pos.getZ() != p_o.getPosition().getZ()){
                moved = this.moveObject(p_o, new_pos);
            }

            //If GameObject moved then update its model.
            if(moved == 0) {
                p_o.updateModel();
            }
        }

        // Delete all marked objects.
        for (var i = 0; i < this.m_deletions.length; i++) {
            this.removeObject(this.m_deletions[i]);
        }

        // Clear list for next update phase.
        this.m_deletions = [];
    }

    // Indicate GameObject is to be deleted at end of current game loop.
    // Return 0 if ok, else -1.
    markForDelete(p_o) {
        // GameObject might already have been marked, so only add once.
        if (this.m_deletions.includes(p_o)) {
            return -1;
        }

        // GameObject not in list, so add.
        this.m_deletions.push(p_o);
        return 0;
    }

    // Draw all objects.
    draw() {
        if(this.m_updates.length > 0) {
            //iterate through all objects
            for (var i = 0; i < this.m_updates.length; i++) {
                this.m_updates[i].draw();
            }
        }
        else {
            renderClear();
        }
    }

    // Return list of Objects collided with at position `where'.
    // Collisions only with solid Objects.
    // Does not consider if p_o is solid or not.
    getCollisions(p_o) {
        // Make empty list.
        var collision_list = [];

        for (var i = 0; i < this.m_updates.length; i++) {
            var p_temp_o = this.m_updates[i];

            // Do not consider self.
            if (p_temp_o != p_o) {
                // bounding box of object
                var b = p_o.getBox();

                // bounding box of other object
                var b_temp = p_temp_o.getBox();

                // collision occur and p_temp_o solid?
                if (utility.boxIntersectBox(b, b_temp) == 0 && p_temp_o.isSolid())
                    collision_list.push(p_temp_o);
            }
        }

        return collision_list;
    }

    // Move Object.
    // If collision with solid, send collision events.
    // If no collision with solid, move ok else don't move Object.
    // If Object is Spectral, move ok.
    // Return 0 if move ok, else -1 if collision with solid.
    // If moved from inside world boundary to outside, generate EventOut.
    moveObject(p_o, where) {

        if (p_o.isSolid()) { // Need to be solid for collisions.
            // Get collisions.
            var list = this.getCollisions(p_o);

            if (list.length != 0) {
                var do_move = true;  // Assume can move.

                // Iterate over list.
                for (var i = 0; i < list.length; i++) {
                    var p_temp_o = list[i];

                    // Create collision event.
                    var c = new EventCollision(p_o, p_temp_o, where);

                    // Send to both objects.
                    p_o.eventHandler(c);
                    p_temp_o.eventHandler(c);

                    // If both HARD, then cannot move.
                    if (p_o.getSolidness() == Solidness.HARD
                        && p_temp_o.getSolidness() == Solidness.HARD)
                        do_move = false;  // Can't move.
                }

                if (!do_move) return -1; // Move not allowed.
            }
        }

        // If here, no collision between two HARD objects so allow move.
        // Do move.
        p_o.setPosition(where);			    // move object

        // If camera is following this object, adjust camera.
        if (this.eye_following == p_o)
            this.setEye(p_o);
        if (this.at_following == p_o)
            this.setAt(p_o);
        if (this.up_following == p_o)
            this.setUp(p_o);

        return 0; // Move was ok.
    }

    setEye(new_eye) {
        eye = vec3(new_eye.getPosition().getX(),
            new_eye.getPosition().getY(),
            new_eye.getPosition().getZ());
    }

    setAt(new_at) {
        at = vec3(new_at.getPosition().getX(),
            new_at.getPosition().getY(),
            new_at.getPosition().getZ());
    }

    setUp(new_up) {
        up = new_up.getBox().getNormalY();
    }

    // Set camera position to follow Object.
    // Set to NULL to stop following.
    // If new_eye_following not legit, return -1 else return 0.
    setEyeFollowing(new_eye_following) {
        // Set to NULL to turn `off' following.
        if (new_eye_following == null) {
            this.eye_following = null;
            return 0;
        }

        // Iterate over all Objects. Make sure new_eye_following is one of the Objects
        // then set found to true.
        var found = false;
        for (var i = 0; i < this.m_updates.length; i++) {
            var p_o = this.m_updates[i];
            if (p_o == new_eye_following)
                found = true;
        }

        // If found, adjust attribute accordingly and set eye position.
        if (found) {
            this.eye_following = new_eye_following;
            this.setEye(this.eye_following);
            return 0;
        }

        // If we get here, was not legit.  Don't change current eye position.
        return -1;
    }

    // Set camera direction to follow Object.
    // Set to NULL to stop following.
    // If new_at_following not legit, return -1 else return 0.
    setAtFollowing(new_at_following) {
        // Set to NULL to turn `off' following.
        if (new_at_following == null) {
            this.at_following = null;
            return 0;
        }

        // Iterate over all Objects. Make sure new_at_following is one of the Objects
        // then set found to true.
        var found = false;
        for (var i = 0; i < this.m_updates.length; i++) {
            var p_o = this.m_updates[i];
            if (p_o == new_at_following)
                found = true;
        }

        if (found) {
            this.at_following = new_at_following;
            this.setAt(this.at_following);
            return 0;
        }

        // If we get here, was not legit.  Don't change current eye position.
        return -1;
    }

    // Set camera orientation to follow Object.
    // Set to NULL to stop following.
    // If new_at_following not legit, return -1 else return 0.
    setUpFollowing(new_up_following) {
        // Set to NULL to turn `off' following.
        if (new_up_following == null) {
            this.up_following = null;
            return 0;
        }

        // Iterate over all Objects. Make sure new_up_following is one of the Objects
        // then set found to true.
        var found = false;
        for (var i = 0; i < this.m_updates.length; i++) {
            var p_o = this.m_updates[i];
            if (p_o == new_up_following)
                found = true;
        }

        if (found) {
            this.up_following = new_up_following;
            this.setUp(this.up_following);
            return 0;
        }

        // If we get here, was not legit.  Don't change current eye position.
        return -1;
    }

    // Set camera position, direction, orientation to following Objects.
    // Set to NULL to stop following.
    setCameraFollowing(new_eye_following, new_at_following, new_up_following) {
        this.setEyeFollowing(new_eye_following);
        this.setAtFollowing(new_at_following);
        this.setUpFollowing(new_up_following);
    }

    // Send event to all Objects.
    // Return count of number of events sent.
    onEvent(event) {
        var count = 0;
        for (var i = 0; i < this.m_updates.length; i++, count++) {
            this.m_updates[i].eventHandler(event);
        }
        return count;
    }
}

class DisplayManager extends Manager {

    constructor() {
        if (!DisplayManager.instance) {
            super();
            this.setType("DisplayManager");

            DisplayManager.instance = this;
        }

        return DisplayManager.instance;
    }

    // Open graphics window, ready for text-based display.
    // Return 0 if ok, else -1.
    startUp() {
        setupWebGL();

        super.startUp();
        return 0;
    }

    // Close graphics window.
    shutDown() {
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        super.shutDown();
    }

    render(shape, color, trans = vec3(), scal = vec3(1, 1, 1),
           rot = 0, axis = vec3(0,1,0)) {
        if(this.isStarted()) {
            renderWebGL(shape, color, trans, scal, rot, axis);
        }
    }
}

class InputManager extends Manager {
    constructor() {
        if (!InputManager.instance) {
            super();
            this.setType("InputManager");

            InputManager.instance = this;
        }

        return InputManager.instance;
    }

    // Get window ready to capture input.
    // Return 0 if ok, else return -1.
    startUp() {
        if (!DM.isStarted())
            return -1;

        super.startUp();
        return 0;
    }

    // Revert back to normal window mode.
    shutDown() {
        super.shutDown();
    }

    // Get input from the keyboard and mouse.
    // Pass event along to all Objects.
    getInput() {
        window.onkeypress = function (event) {
            //create EventKeyboard(key and action)
            var p_key_event = new EventKeyboard();
            p_key_event.setKeyboardAction(EventKeyboardAction.KEY_PRESS);
            p_key_event.setKey(event.key);

            //send EventKeyboard to all Objects
            WM.onEvent(p_key_event);
        }

        window.onkeyup = function (event) {
            //create EventKeyboard(key and action)
            var p_key_event = new EventKeyboard();
            p_key_event.setKeyboardAction(EventKeyboardAction.KEY_UP);
            p_key_event.setKey(event.key);

            //send EventKeyboard to all Objects
            WM.onEvent(p_key_event);
        }

        window.onkeydown = function (event) {
            //create EventKeyboard(key and action)
            var p_key_event = new EventKeyboard();
            p_key_event.setKeyboardAction(EventKeyboardAction.KEY_DOWN);
            p_key_event.setKey(event.key);

            //send EventKeyboard to all Objects
            WM.onEvent(p_key_event);
        }

        window.onclick = function (event) {
            //create EventMouse(x, y and action)
            var p_mouse_event = new EventMouse();
            p_mouse_event.setMouseAction(EventMouseAction.MOUSE_CLICK);
            p_mouse_event.setMousePosition(vec2(event.clientX,event.clientY));

            //send EventMouse to all Objects
            WM.onEvent(p_mouse_event);
        }

        window.onmouseup = function (event) {
            //create EventMouse(x, y and action)
            var p_mouse_event = new EventMouse();
            p_mouse_event.setMouseAction(EventMouseAction.MOUSE_UP);
            p_mouse_event.setMousePosition(vec2(event.clientX,event.clientY));

            //send EventMouse to all Objects
            WM.onEvent(p_mouse_event);
        }

        window.onmousedown = function (event) {
            //create EventMouse(x, y and action)
            var p_mouse_event = new EventMouse();
            p_mouse_event.setMouseAction(EventMouseAction.MOUSE_DOWN);
            p_mouse_event.setMousePosition(vec2(event.clientX,event.clientY));

            //send EventMouse to all Objects
            WM.onEvent(p_mouse_event);
        }

        window.onmousemove = function (event) {
            //create EventMouse(x, y and action)
            var p_mouse_event = new EventMouse();
            p_mouse_event.setMouseAction(EventMouseAction.MOUSE_MOVE);
            p_mouse_event.setMousePosition(vec2(event.clientX,event.clientY));

            //send EventMouse to all Objects
            WM.onEvent(p_mouse_event);
        }
    }
}

var object_static_id = 0;
class GameObject {

    WM = new WorldManager();
    DM = new DisplayManager();

    // Construct GameObject. Set default parameters and add to game world (WorldManager).
    constructor() {

        this.m_id = object_static_id;			// Unique game engine defined identifier.
        object_static_id++;
        this.m_type = "Object";					// Game programmer defined type.
        this.m_position = new Vector();  		// Position in game world.
        this.m_direction = new Vector();  		// Direction vector.
        this.m_speed = 0;
        this.m_rotateSpeed = 0;
        this.m_solidness = Solidness.HARD;		// Solidness of object.
        this.m_model = new Model();  			// Model associated with GameObject.

        this.WM.insertObject(this);
    }

    // Set GameObject id.
    setId(new_id) {
        this.m_id = new_id;
    }

    // Get GameObject id.
    getId() {
        return this.m_id;
    }

    // Set type identifier of GameObject.
    setType(new_type) {
        this.m_type = new_type;
    }

    // Get type identifier of GameObject.
    getType() {
        return this.m_type;
    }

    // Set position of GameObject.
    setPosition(new_pos) {
        this.m_position = new_pos;
    }

    // Get position of GameObject.
    getPosition() {
        return this.m_position;
    }

    // Handle event (default is to ignore everything).
    // Return 0 if ignored , else 1 if handled.
    eventHandler(p_e) {
        return 0;
    }

    // Set speed of GameObject.
    setSpeed(new_speed) {
        this.m_speed = new_speed;
    }

    // Get speed of GameObject.
    getSpeed() {
        return this.m_speed;
    }

    // Set direction of GameObject.
    setDirection(new_direction) {
        this.m_direction = new_direction;
    }

    // Get direction of GameObject.
    getDirection() {
        return this.m_direction;
    }

    // Set direction and speed of GameObject.
    setVelocity(new_velocity) {
        var new_direction = new Vector(new_velocity.getX(), new_velocity.getY(), new_velocity.getZ());
        new_direction.normalize();
        this.setDirection(new_direction);

        this.setSpeed(new_velocity.getMagnitude());
    }

    // Get velocity of GameObject based on direction and speed.
    getVelocity() {
        var velocity = new Vector(this.m_direction.getX(), this.m_direction.getY(), this.m_direction.getZ());
        velocity.scale(this.m_speed);

        return velocity;
    }

    // Set Rotate speed of GameObject.
    setRotateSpeed(new_rotateSpeed) {
        this.m_rotateSpeed = new_rotateSpeed;
    }

    // Get Rotate speed of GameObject.
    getRotateSpeed() {
        return this.m_rotateSpeed;
    }

    // Predict GameObject position based on speed and direction.
    // Return predicted position.
    predictPosition() {
        // Add velocity to position.
        var new_pos = this.getPosition().add(this.getVelocity());

        // Return new position.
        return new_pos;
    }

    // True if HARD or SOFT, else false.
    isSolid() {
        if (this.m_solidness == Solidness.HARD || this.m_solidness == Solidness.SOFT)
            return true;
        else
            return false;
    }

    // Set object solidness, with checks for consistency.
    // Return 0 if ok, else -1.
    setSolidness(new_solid) {
        if (new_solid == Solidness.HARD || new_solid == Solidness.SOFT
            || new_solid == Solidness.SPECTRAL) {
            this.m_solidness = new_solid;
            return 0;
        }
        return -1;
    }

    // Return object solidness.
    getSolidness() {
        return this.m_solidness;
    }

    // Set Model for this GameObject to new one.
    setModel(new_model) {
        this.m_model = new_model;

        if(this.m_position.getX() != this.m_model.getTranslate()[0]
            || this.m_position.getY() != this.m_model.getTranslate()[1]
            || this.m_position.getZ() != this.m_model.getTranslate()[2]) {
            var new_pos = vec3(this.m_position.getX(), this.m_position.getY(), this.m_position.getZ());
            this.m_model.setTranslate(new_pos);
        }

        if(this.m_position.getX() != this.m_model.getBox()[0]
            || this.m_position.getY() != this.m_model.getBox()[1]
            || this.m_position.getZ() != this.m_model.getBox()[2]) {
            var new_pos = vec3(this.m_position.getX(), this.m_position.getY(), this.m_position.getZ());
            var new_box = this.m_model.getBox();
            new_box.setCenter(new_pos);
            this.m_model.setBox(new_box);
        }
    }

    // Get Model for this GameObject.
    getModel() {
        return this.m_model;
    }

    // Update Model according to current position and rotate speed
    updateModel() {
        var new_angle = this.m_model.getRotateAngle() + this.m_rotateSpeed;
        var new_pos = vec3(this.m_position.getX(), this.m_position.getY(), this.m_position.getZ());

        this.m_model.setRotateAngle(new_angle);
        this.m_model.setTranslate(new_pos);
        this.m_model.updateBox();
    }

    // Set Object's bounding box.
    setBox(new_box) {
        this.m_model.setBox(new_box);
    }

    // Get Object's bounding box.
    getBox()  {
        return this.m_model.getBox();
    }

    // Draw GameObject Shape.
    // Return 0 if ok, else -1.
    draw() {
        this.DM.render(this.m_model.getShape(), this.m_model.getColor(),
            this.m_model.getTranslate(), this.m_model.getScale(),
            this.m_model.getRotateAngle(), this.m_model.getRotateAxis());
    }
}

const Solidness = Object.freeze({
    HARD: "Hard",
    SOFT: "Soft",
    SPECTRAL: "Spectral"
});

class GameEvent {
    // Create base event.
    constructor() {
        this.m_event_type = EventType.UNDEFINED;
    }

    // Set event type.
    setType(new_type) {
        this.m_event_type = new_type;
    }

    // Get event type.
    getType() {
        return this.m_event_type;
    }
}

const EventType = Object.freeze({
    UNDEFINED: "Undefined",
    STEP: "Step",
    COLLISION: "Collision",
    KEYBOARD: "Keyboard",
    MOUSE: "Mouse"
});

class EventStep extends GameEvent {

    constructor(init_step_count = 0) {
        super();
        this.m_step_count = init_step_count;

        this.setType(EventType.STEP);
    }

    // Set step count.
    setStepCount(new_step_count) {
        this.m_step_count = new_step_count;
    }

    // Get step count.
    getStepCount() {
        return this.m_step_count;
    }
}

class EventCollision extends GameEvent {

    // Create collision event between o1 and o2 at position p.
    // Object o1 `caused' collision by moving into object o2.
    // Default collision event is at (0,0,0) with o1 and o2 NULL.
    constructor(p_o1 = null,
                p_o2 = null,
                p = new Vector(0,0,0)) {
        super();
        this.m_pos = p;			// Where collision occurred.
        this.m_p_obj1 = p_o1;	// Object moving, causing collision.
        this.m_p_obj2 = p_o2;	// Object being collided with.

        this.setType(EventType.COLLISION);
    }

    // Set object that caused collision.
    setObject1(p_new_o1) {
        this.m_p_obj1 = p_new_o1;
    }

    // Return object that caused collision.
    getObject1() {
        return this.m_p_obj1;
    }

    // Set object that was collided with.
    setObject2(p_new_o2) {
        this.m_p_obj2 = p_new_o2;
    }

    // Return object that was collided with.
    getObject2() {
        return this.m_p_obj2;
    }

    // Set position of collision.
    setPosition(new_pos) {
        this.m_pos = new_pos;
    }

    // Return position of collision.
    getPosition() {
        return this.m_pos;
    }
}

class EventKeyboard extends GameEvent {

    constructor() {
        super();
        this.m_key_val = "undefined_key";	                        // Key value.
        this.m_keyboard_action = EventKeyboardAction.UNDEFINED_KEYBOARD_ACTION;		// Key action.

        this.setType(EventType.KEYBOARD);
    }

    // Set key in event.
    setKey(new_key) {
        this.m_key_val = new_key;
    }

    // Get key from event.
    getKey()  {
        return this.m_key_val;
    }

    // Set keyboard event action.
    setKeyboardAction(new_action) {
        this.m_keyboard_action = new_action;
    }

    // Get keyboard event action.
    getKeyboardAction() {
        return this.m_keyboard_action;
    }
}

const EventKeyboardAction = Object.freeze({
    UNDEFINED_KEYBOARD_ACTION: "undefined_keyboard_action",
    KEY_PRESS: "key_press",
    KEY_UP: "key_up",
    KEY_DOWN: "key_down"
});

class EventMouse extends GameEvent {

    constructor() {
        super();
        this.m_mouse_action = EventMouseAction.UNDEFINED_MOUSE_ACTION;		// Mouse action.
        this.m_mouse_xy = vec2();

        this.setType(EventType.MOUSE);
    }

    // Set mouse event action.
    setMouseAction(new_mouse_action) {
        this.m_mouse_action = new_mouse_action;
    }

    // Get mouse event action.
    getMouseAction() {
        return this.m_mouse_action;
    }

    // Set mouse event's position.
    setMousePosition(new_mouse_xy) {
        this.m_mouse_xy = new_mouse_xy;
    }

    // Get mouse event's y position.
    getMousePosition() {
        return this.m_mouse_xy;
    }
}

const EventMouseAction = Object.freeze({
    UNDEFINED_MOUSE_ACTION: "undefined_mouse_action",
    MOUSE_CLICK: "mouse_click",
    MOUSE_UP: "mouse_up",
    MOUSE_DOWN: "mouse_down",
    MOUSE_MOVE: "mouse_move"
});

class Clock {
    constructor() {
        this.start = Date.now(); 			// Previous time delta() called
        this.frequency = 1;					// number of ticks-per-seconds
    }

    // Return time elapsed since delta() was last called, -1 if error.
    // Resets previous time.
    // Units are microseconds.
    delta() {
        var elapsed_time, newtime, delasped;

        newtime = Date.now(); //get current time, in milliseconds
        delasped = newtime - this.start;

        delasped *= 1000; //convert to microseconds
        delasped /= this.frequency;
        elapsed_time = delasped;

        // reset previous time
        this.start = newtime;

        return elapsed_time;
    }

    // Return time elapsed since delta() was last called, -1 if error.
    // Does not reset previous time.
    // Units are microseconds.
    split() {
        var elapsed_time, newtime, delasped;

        newtime = Date.now(); //get current time, in milliseconds
        delasped = newtime - this.start;

        delasped *= 1000; //convert to microseconds
        delasped /= this.frequency;
        elapsed_time = delasped;

        return elapsed_time;
    }
}

class Vector {

    // Create Vector with (x,y).
    constructor(init_x = 0, init_y = 0, init_z = 0) {
        this.m_x = init_x;
        this.m_y = init_y;
        this.m_z = init_z;
    }

    // Get/set horizontal component.
    setX(new_x) {
        this.m_x = new_x;
    }

    getX() {
        return this.m_x;
    }

    // Get/set vertical component.
    setY(new_y) {
        this.m_y = new_y;
    }

    getY() {
        return this.m_y;
    }

    // Get/set depth component.
    setZ(new_z) {
        this.m_z = new_z;
    }

    getZ() {
        return this.m_z;
    }

    // Set horizontal, vertical, depth components.
    setXYZ(new_x, new_y, new_z) {
        this.m_x = new_x;
        this.m_y = new_y;
        this.m_z = new_z;
    }

    // Return magnitude of vector.
    getMagnitude() {
        var mag = Math.sqrt(Math.pow(this.m_x,2)
            + Math.pow(this.m_y,2)
            + Math.pow(this.m_z,2) );
        return mag;
    }

    // Normalize vector.
    normalize() {
        var length = this.getMagnitude();
        if (length > 0) {
            this.m_x = this.m_x / length;
            this.m_y = this.m_y / length;
            this.m_z = this.m_z / length;
        }
        return this;
    }

    // Scale vector.
    scale(s) {
        this.m_x = this.m_x * s;
        this.m_y = this.m_y * s;
        this.m_z = this.m_z * s;
        return this;
    }

    // Add two Vectors, return new Vector.
    add(other) {
        var v = new Vector();					// Create new vector.
        v.setX(this.getX() + other.getX());		// Add x components.
        v.setY(this.getY() + other.getY());		// Add y components.
        v.setZ(this.getZ() + other.getZ());		// Add z components.
        return v;							    // Return new vector.
    }
}

class Model {
    constructor() {
        this.m_shape = null;
        this.m_color = null;
        this.m_translate = vec3(0,0,0);
        this.m_scale = vec3(1,1,1);
        this.m_rotateAngle = 0;
        this.m_rotateAxis = vec3(0,1,0);
        this.m_box = new Box();
    }

    setShape(new_shape) {
        this.m_shape = new_shape;
    }

    getShape() {
        return this.m_shape;
    }

    setColor(new_color) {
        this.m_color = new_color;
    }

    getColor() {
        return this.m_color;
    }

    setTranslate(new_translate) {
        this.m_translate = new_translate;
    }

    getTranslate() {
        return this.m_translate;
    }

    setScale(new_scale) {
        this.m_scale = new_scale;
    }

    getScale() {
        return this.m_scale;
    }

    setRotateAngle(new_rotateAngle) {
        this.m_rotateAngle = new_rotateAngle;
    }

    getRotateAngle() {
        return this.m_rotateAngle;
    }

    setRotateAxis(new_rotateAxis) {
        this.m_rotateAxis = new_rotateAxis;
    }

    getRotateAxis() {
        return this.m_rotateAxis;
    }

    setBox(new_box) {
        this.m_box = new_box
    }

    getBox()  {
        return this.m_box;
    }

    updateBox() {
        this.m_box.setCenter(this.m_translate);
        this.m_box.setWidth(this.m_scale[0]);
        this.m_box.setHeight(this.m_scale[1]);
        this.m_box.setDepth(this.m_scale[2]);
    }
}

class Box {
    constructor(init_center = vec3(0,0,0),
                init_width = 0,
                init_height = 0,
                init_depth = 0) {
        this.m_center = init_center;
        this.m_width = init_width;
        this.m_height = init_height;
        this.m_depth = init_depth
    }

    setCenter(new_center) {
        this.m_center = new_center;
    }

    getCenter() {
        return this.m_center;
    }

    setWidth(new_width) {
        this.m_width = new_width;
    }

    getWidth() {
        return this.m_width;
    }

    setHeight(new_height) {
        this.m_height = new_height;
    }

    getHeight() {
        return this.m_height;
    }

    setDepth(new_depth) {
        this.m_depth = new_depth;
    }

    getDepth() {
        return this.m_depth;
    }
}

class utility {

    static arrayRemove(arr, value) {
        return arr.filter(function (ele) {
            return ele != value;
        });
    }

    static boxIntersectBox(box1, box2) {
        var box1_center = box1.getCenter();
        var box1_x = box1.getWidth()/2;
        var box1_y = box1.getHeight()/2;
        var box1_z = box1.getDepth()/2;
        var box2_center = box2.getCenter();
        var box2_x = box2.getWidth()/2;
        var box2_y = box2.getHeight()/2;
        var box2_z = box2.getDepth()/2;

        var box1_min_x = box1_center[0] - box1_x;
        var box1_max_x = box1_center[0] + box1_x;
        var box1_min_y = box1_center[1] - box1_y;
        var box1_max_y = box1_center[1] + box1_y;
        var box1_min_z = box1_center[2] - box1_z;
        var box1_max_z = box1_center[2] + box1_z;

        var box2_min_x = box2_center[0] - box2_x;
        var box2_max_x = box2_center[0] + box2_x;
        var box2_min_y = box2_center[1] - box2_y;
        var box2_max_y = box2_center[1] + box2_y;
        var box2_min_z = box2_center[2] - box2_z;
        var box2_max_z = box2_center[2] + box2_z;

        if ((box1_min_x <= box2_max_x && box1_max_x >= box2_min_x) &&
            (box1_min_y <= box2_max_y && box1_max_y >= box2_min_y) &&
            (box1_min_z <= box2_max_z && box1_max_z >= box2_min_z)) {
            return 0;
        }
    }

    static cubeBox() {
        var center = vec3(0,0,0);
        var width = 1;
        var height = 1;
        var depth = 1;

        var box = new Box(center,width,height,depth);
        return box;
    }

    static cube() {
        var verts = [];
        var normals = [];

        var quads = [];
        quads.push(this.quad(1, 0, 3, 2));
        quads.push(this.quad(2, 3, 7, 6));
        quads.push(this.quad(3, 0, 4, 7));
        quads.push(this.quad(6, 5, 1, 2));
        quads.push(this.quad(4, 5, 6, 7));
        quads.push(this.quad(5, 4, 0, 1));

        for (var i = 0; i < quads.length; i++) {
            verts = verts.concat(quads[i][0]);
            normals = normals.concat(quads[i][1]);
        }

        return [verts, normals];
    }

    //helper function to generate cube vertices
    static quad(a, b, c, d) {
        var verts = [];
        var normals = [];

        var vertices = [
            vec4(-0.5, -0.5, 0.5, 1.0),
            vec4(-0.5, 0.5, 0.5, 1.0),
            vec4(0.5, 0.5, 0.5, 1.0),
            vec4(0.5, -0.5, 0.5, 1.0),
            vec4(-0.5, -0.5, -0.5, 1.0),
            vec4(-0.5, 0.5, -0.5, 1.0),
            vec4(0.5, 0.5, -0.5, 1.0),
            vec4(0.5, -0.5, -0.5, 1.0)
        ];

        var tri1 = this.triangle(vertices[a], vertices[b], vertices[c]);
        var tri2 = this.triangle(vertices[a], vertices[c], vertices[d]);

        verts = verts.concat(tri1[0]);
        verts = verts.concat(tri2[0]);
        normals = normals.concat(tri1[1]);
        normals = normals.concat(tri2[1]);

        return [verts, normals];
    }

    //generate triangle vertices
    static triangle(a, b, c) {
        var verts = [];
        verts.push(a);
        verts.push(b);
        verts.push(c);

        // normals are vectors
        var normals = [];

        normals.push(a[0], a[1], a[2], 0.0);
        normals.push(b[0], b[1], b[2], 0.0);
        normals.push(c[0], c[1], c[2], 0.0);

        return [verts, normals];
    }

    static color(color) {
        switch (color) {
            case "red":
                return vec4(1.0, 0.0, 0.0, 1.0);
                break;
            case "green":
                return vec4(0.0, 1.0, 0.0, 1.0);
                break;
            case "blue":
                return vec4(0.0, 0.0, 1.0, 1.0);
                break;
            case "yellow":
                return vec4(1.0, 1.0, 0.0, 1.0);
                break;
            case "magenta":
                return vec4(1.0, 0.0, 1.0, 1.0);
                break;
            case "cyan":
                return vec4(0.0, 1.0, 1.0, 1.0);
                break;
            case "gray":
                return vec4(0.5, 0.5, 0.5, 1.0);
                break;
            case "white":
                return vec4(1.0, 1.0, 1.0, 1.0);
                break;
            case "black":
                return vec4(0.0, 0.0, 0.0, 1.0);
                break;
            default:
                return vec4(0.0, 0.0, 0.0, 1.0);
        }
    }
}

class ObjectForTest extends GameObject {
    constructor(pos, velo, rot, shape, color, angle, scale) {
        super();
        this.m_type = "Test Object";

        this.toggle_event_step = false;
        this.toggle_event_collision = true;

        this.collision_cooldown = 10;
        this.collision_count = 0;

        this.draw_box = false;

        this.setPosition(pos);
        this.setVelocity(velo);
        this.setRotateSpeed(rot);
        var model = new Model();
        model.setShape(shape);
        model.setColor(color);
        model.setBox(utility.cubeBox());
        model.setRotateAngle(angle);
        model.setScale(scale);
        model.updateBox();
        this.setModel(model);
    }

    eventHandler(p_e) {
        if (p_e.getType() == EventType.STEP) {
            if(this.toggle_event_step) {
                if (p_e.getStepCount() % 20 == 0) {
                    LM.writeLog("testEventStep: Even Step " + p_e.getStepCount());
                }
                LM.writeLog("testEventStep: odd step not handled");
            }

            if(this.collision_count > 0) {
                this.collision_count--;
            }

            if (p_e.getStepCount() % 200 == 0) {
                LM.writeLog("testObject Rendering: Step " + p_e.getStepCount() + ", reverse direction");
                this.setDirection(this.getDirection().scale(-1));
            }
        }

        if(p_e.getType() == EventType.COLLISION) {
            if(this.toggle_event_collision) {
                if(this.collision_count <= 0) {
                    this.collision_count = this.collision_cooldown;

                    if(this.getSolidness() == Solidness.HARD) {
                        LM.writeLog("Hard object " + this.getId() + " collided, remove this object ");
                        WM.markForDelete(this);
                        return 1;
                    }
                    if(this.getSolidness() == Solidness.SOFT) {
                        LM.writeLog("Soft object " + this.getId() + " collided, reverse direction");
                        this.setDirection(this.getDirection().scale(-1));
                    }
                }
            }
        }

        if (p_e.getType() == EventType.KEYBOARD) {
            if (p_e.getKeyboardAction() == EventKeyboardAction.KEY_PRESS) {
                if (p_e.getKey() == 'z') {
                    LM.writeLog("testEventKeyboard: " + p_e.getKey() + " key detect");
                    this.getModel().setRotateAngle(this.getModel().getRotateAngle()+10);
                    return 1;
                }
                if (p_e.getKey() == 'x') {
                    this.toggle_event_step = !this.toggle_event_step;
                    if(this.toggle_event_step) {
                        var toggle = "enable event step"
                    }
                    else {
                        var toggle = "disable event step"
                    }
                    LM.writeLog("testEventKeyboard: " + p_e.getKey() + " key detect : " + toggle);
                    return 1;
                }

                if (p_e.getKey() == 'c') {
                    this.toggle_event_collision = !this.toggle_event_collision;
                    if(this.toggle_event_collision) {
                        var toggle = "enable event collision"
                    }
                    else {
                        var toggle = "disable event collision"
                    }
                    LM.writeLog("testEventKeyboard: " + p_e.getKey() + " key detect : " + toggle);
                    return 1;
                }

                if(p_e.getKey() == 'g') {
                    this.draw_box = !this.draw_box;
                }
            }
        }

        if (p_e.getType() == EventType.MOUSE) {
            if(p_e.getMouseAction() == EventMouseAction.MOUSE_CLICK) {
                LM.writeLog("testEventMouse: click detect at " + p_e.getMousePosition());
                return 1;
            }
        }

        return 0;
    }

    draw() {
        super.draw();
        if(this.draw_box) {
            renderBox(this.getBox());
        }
    }
}

class TestCamera extends GameObject {
    constructor() {
        super();
        this.m_type = "Test Camera";
        this.setSolidness(Solidness.SPECTRAL);
        this.setPosition(new Vector(eye[0],eye[1],eye[2]));

        this.following = false;
        this.atFollowing = false;
        this.atFollowingObject = null;

        this.forwarding = false;
        this.f_speed = -0.1;
        this.backwarding = false;
        this.b_speed = 0.1;

        this.draw_shape = false;
        this.draw_box = false;
        var model = new Model();
        model.setShape(utility.cube());
        model.setColor(utility.color("gray"));
        model.setBox(utility.cubeBox());
        this.setModel(model);
    }

    eventHandler(p_e) {
        if (p_e.getType() == EventType.KEYBOARD) {
            if (p_e.getKeyboardAction() == EventKeyboardAction.KEY_PRESS) {
                if (p_e.getKey() == 'q') {
                    LM.writeLog("testEventKeyboard: " + p_e.getKey() + " key detect");
                    GM.setGameOver(true);
                    return 1;
                }

                if (p_e.getKey() == 'z') {
                    LM.writeLog("testEventKeyboard: " + p_e.getKey() + " key detect");
                    this.getModel().setRotateAngle(this.getModel().getRotateAngle()+10);
                    return 1;
                }

                if(p_e.getKey() == 'e') {
                    if(this.following) {
                        var follow = null;
                        LM.writeLog("eye following disable");
                    }
                    else {
                        var follow = this;
                        LM.writeLog("eye following enable");
                    }
                    this.following = !this.following;
                    WM.setEyeFollowing(follow);
                }

                if(p_e.getKey() == 'r') {
                    if(this.atFollowing) {
                        var follow = null;
                        LM.writeLog("at following disable");
                    }
                    else {
                        var follow = this.atFollowingObject;
                        LM.writeLog("at following enable");
                    }
                    this.atFollowing = !this.atFollowing;
                    WM.setAtFollowing(follow);
                }

                if(p_e.getKey() == 'f') {
                    this.draw_shape = !this.draw_shape;
                }

                if(p_e.getKey() == 'g') {
                    this.draw_box = !this.draw_box;
                }

                if (p_e.getKey() == 'w' || p_e.getKey() == 's') {
                    if (p_e.getKey() == 'w') {
                        this.forwarding = !this.forwarding;
                        this.backwarding = false;
                    }
                    else if (p_e.getKey() == 's'){
                        this.backwarding = !this.backwarding;
                        this.forwarding = false;
                    }

                    var new_v = this.getVelocity();
                    if(this.forwarding) {
                        LM.writeLog("testCamera: move forward");
                        new_v.setZ(this.f_speed);
                    }
                    else if (this.backwarding) {
                        LM.writeLog("testCamera: move backward");
                        new_v.setZ(this.b_speed);
                    }
                    else {
                        LM.writeLog("testCamera: stop move");
                        var new_v = this.getVelocity();
                        new_v.setZ(0);
                    }

                    this.setVelocity(new_v);
                }

            }
        }

        return 0;
    }

    setAtFollowing(object) {
        this.atFollowingObject = object;
    }

    draw() {
        if(this.draw_shape) {
            super.draw();
        }
    }
}


var gl;
var program;

var mvMatrix, modelMatrix, viewMatrix, pMatrix, modelViewLoc, projectionLoc;
var eye = vec3(0.0, 2.0, 4.0);
var at = vec3(0.0, 0.0, 0.0);
var up = vec3(0.0, 1.0, 0.0);

var lightPosition = vec4(0.0, 0.0, 5.0, 0.0 );
var lightAmbient = vec4( 0.1, 0.1, 0.1, 1.0 );
var lightDiffuse = vec4( 1.0, 1.0, 1.0, 1.0 );
var lightSpecular = vec4( 1.0, 1.0, 1.0, 1.0 );
var cutoffThreshold = 0.98;

var materialAmbient = vec4( 1.0, 1.0, 1.0, 1.0 );
var materialDiffuse = vec4( 0.8, 0.8, 0.8, 1.0 );
var materialSpecular = vec4( 1.0, 1.0, 1.0, 1.0 );
var materialShininess = 20.0;

var GM = new GameManager();
var LM = new LogManager();
var WM = new WorldManager();
var DM = new DisplayManager();

async function main() {

    var test = true;
    if (!testLM()) test = false;

    LM.startUp();
    if (!await testClock()) test = false;
    if (!testVector()) test = false;
    if (!testGameObject()) test = false;
    if (!testWM()) test = false;
    if (!await testGM()) test = false;

    // testDM();

    LM.startUp();
    if (test) {
        LM.writeLog("Game Engine Backend Test : SUCCESS");
    } else {
        LM.writeLog("Game Engine Backend Test : FAILED");
    }

}

function setupWebGL() {
    // Retrieve <canvas> element
    var canvas = document.getElementById('webgl');

    // Get the rendering context for WebGL
    gl = WebGLUtils.setupWebGL(canvas, undefined);
    if (!gl) {
        console.log('Failed to get the rendering context for WebGL');
        return;
    }

    // Initialize shaders
    program = initShaders(gl, "vshader", "fshader");
    gl.useProgram(program);

    modelViewLoc = gl.getUniformLocation(program, "modelViewMatrix");

    //Set up the viewport
    gl.viewport(0, 0, 400, 400);
    var fovy = 45.0;  // Field-of-view in Y direction angle (in degrees)
    var aspect = canvas.width / canvas.height;
    projectionLoc = gl.getUniformLocation(program, "projectionMatrix");
    pMatrix = perspective(fovy, aspect, .1, 25);
    gl.uniformMatrix4fv(projectionLoc, false, flatten(pMatrix));

    var cutoffLoc = gl.getUniformLocation(program, "cutoffThreshold");
    gl.uniform1f(cutoffLoc, cutoffThreshold);

    newLight(lightDiffuse, lightSpecular, lightAmbient);
    gl.uniform4fv(gl.getUniformLocation(program, "lightPosition"), flatten(lightPosition));
    gl.uniform1f(gl.getUniformLocation(program, "shininess"), materialShininess);

    // Set clear color
    gl.clearColor(0.0, 0.0, 0.0, 1.0);

    // Clear <canvas> by clearing the color buffer
    gl.enable(gl.DEPTH_TEST);

    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
}

function renderClear() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

function renderWebGL(shape, color, trans = vec3(), scal = vec3(1, 1, 1),
                     rot = 0, axis = vec3(0,1,0)) {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE);

    function renderThis() {
        viewMatrix = lookAt(eye, at, up);
        modelMatrix = mat4();

        modelMatrix = mult(modelMatrix, translate(trans));
        modelMatrix = mult(modelMatrix, scalem(scal));
        modelMatrix = mult(modelMatrix, rotate(rot,axis));
        mvMatrix = mult(viewMatrix, modelMatrix);
        gl.uniformMatrix4fv(modelViewLoc, false, flatten(mvMatrix));

        gl.uniform1i(gl.getUniformLocation(program, "useLight"), 1);

        drawShape(shape, color);
    }

    requestAnimationFrame(renderThis);
}

//draw a shape from given vertices, normals, and color
function drawShape(shape, color) {
    var vertices = shape[0];
    var normals = shape[1];
    var fragColors = [];

    for (var i = 0; i < vertices.length; i++) {
        fragColors.push(color);
    }

    var pBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(vertices), gl.STATIC_DRAW);

    var vPosition = gl.getAttribLocation(program, "vPosition");
    gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);

    var vNormal = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vNormal);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(normals), gl.STATIC_DRAW);

    var vNormalPosition = gl.getAttribLocation(program, "vNormal");
    gl.vertexAttribPointer(vNormalPosition, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vNormalPosition);

    var cBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(fragColors), gl.STATIC_DRAW);

    var vColor = gl.getAttribLocation(program, "vColor");
    gl.vertexAttribPointer(vColor, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vColor);

    gl.drawArrays(gl.TRIANGLES, 0, vertices.length);
}

function renderBox(box, trans = vec3(), scal = vec3(1, 1, 1),
                     rot = 0, axis = vec3(0,1,0)) {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.CULL_FACE);

    function renderThis() {
        viewMatrix = lookAt(eye, at, up);
        modelMatrix = mat4();

        modelMatrix = mult(modelMatrix, translate(trans));
        modelMatrix = mult(modelMatrix, scalem(scal));
        modelMatrix = mult(modelMatrix, rotate(rot,axis));
        mvMatrix = mult(viewMatrix, modelMatrix);
        gl.uniformMatrix4fv(modelViewLoc, false, flatten(mvMatrix));

        gl.uniform1i(gl.getUniformLocation(program, "useLight"), 0);

        drawBox(box);
    }

    requestAnimationFrame(renderThis);
}

function drawBox(box) {
    for(var i = 1; i <= 6; i++) {
        drawBoxFace(box,i);
    }

}

function drawBoxFace(box,faceNum) {
    var vertices = getBoxFace(box,faceNum);
    var fragColors = [];

    for (var i = 0; i < vertices.length; i++) {
        fragColors.push(utility.color("white"));
    }

    var pBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(vertices), gl.STATIC_DRAW);

    var vPosition = gl.getAttribLocation(program, "vPosition");
    gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);

    var cBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(fragColors), gl.STATIC_DRAW);

    var vColor = gl.getAttribLocation(program, "vColor");
    gl.vertexAttribPointer(vColor, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vColor);

    gl.drawArrays(gl.LINE_LOOP, 0, vertices.length);
}

function getBoxFace(box,faceNum) {
    var center = vec4(box.getCenter(),1);
    var x = scale(box.getWidth()/2,vec4(1,0,0,0));
    var y = scale(box.getHeight()/2,vec4(0,1,0,0))
    var z = scale(box.getDepth()/2,vec4(0,0,1,0))
    var vertices = [
        add(subtract(subtract(center,x),y),z),
        add(add(subtract(center,x),y),z),
        add(add(add(center,x),y),z),
        add(subtract(add(center,x),y),z),
        subtract(subtract(subtract(center,x),y),z),
        subtract(add(subtract(center,x),y),z),
        subtract(add(add(center,x),y),z),
        subtract(subtract(add(center,x),y),z)
    ];

    var face = [];
    switch (faceNum) {
        case 1:
            face = [vertices[1],vertices[0],vertices[3],vertices[2]];
            break;
        case 2:
            face = [vertices[2],vertices[3],vertices[7],vertices[6]];
            break;
        case 3:
            face = [vertices[3],vertices[0],vertices[4],vertices[7]];
            break;
        case 4:
            face = [vertices[6],vertices[5],vertices[1],vertices[2]];
            break;
        case 5:
            face = [vertices[4],vertices[5],vertices[6],vertices[7]];
            break;
        case 6:
            face = [vertices[5],vertices[4],vertices[0],vertices[1]];
            break;
    }
    return face;
}

// change light attributes (diffuse, specular, ambient)
function newLight(diffuse, specular, ambient) {
    var diffuseProduct = mult(diffuse, materialDiffuse);
    var specularProduct = mult(specular, materialSpecular);
    var ambientProduct = mult(ambient, materialAmbient);
    gl.uniform4fv(gl.getUniformLocation(program, "diffuseProduct"), flatten(diffuseProduct));
    gl.uniform4fv(gl.getUniformLocation(program, "specularProduct"), flatten(specularProduct));
    gl.uniform4fv(gl.getUniformLocation(program, "ambientProduct"), flatten(ambientProduct));
}

function testLM() {
    // Start up LogManager.
    if (LM.startUp() != 0) {
        console.log("Error starting log manager!\n");
        return false;
    }

    // SUCCESSfully started, so write some stuff.
    LM.writeLog("This is a test.");
    LM.writeLog("This is test " + 2);
    LM.writeLog("This is " + "test " + 2.5);

    // Shutdown LogManager.
    LM.shutDown();

    return true;
}

async function testClock() {
    var clock = new Clock();
    var accept_err;
    var test = true;
    var testnum = 0;

    //reset timer
    clock.split();

    //test sleep 100ms = 100000 microsec, expect 100000 elapse
    testnum++;
    await new Promise(r => setTimeout(r, 100));
    var testClock = clock.split();
    var expectClock = 100000;
    accept_err = expectClock / 5;
    LM.writeLog("testClock" + testnum + ": split >> " + testClock);
    LM.writeLog("testClock" + testnum + ": split >> expect ~ " + expectClock);
    if (Math.abs(testClock - expectClock) > accept_err) {
        LM.writeLog("testClock" + testnum + ": split failed");
        test = false;
    } else {
        LM.writeLog("testClock" + testnum + ": split success");
    }

    //test sleep another 100ms = 100000 microsec, expect 200000 elapse
    testnum++;
    await new Promise(r => setTimeout(r, 100));
    var testClock = clock.delta();
    var expectClock = 200000;
    accept_err = expectClock / 5;
    LM.writeLog("testClock" + testnum + ": delta >> " + testClock);
    LM.writeLog("testClock" + testnum + ": delta >> expect ~ " + expectClock);
    if (Math.abs(testClock - expectClock) > accept_err) {
        LM.writeLog("testClock" + testnum + ": delta failed");
        test = false;
    } else {
        LM.writeLog("testClock" + testnum + ": delta success");
    }

    //test sleep another 100ms = 100000 microsec, expect 100000 elapse as it was reset
    testnum++;
    await new Promise(r => setTimeout(r, 100));
    var testClock = clock.split();
    var expectClock = 100000;
    accept_err = expectClock / 5;
    LM.writeLog("testClock" + testnum + ": split after delta >> " + testClock);
    LM.writeLog("testClock" + testnum + ": split after delta >> expect ~ " + expectClock);
    if (Math.abs(testClock - expectClock) > accept_err) {
        LM.writeLog("testClock" + testnum + ": split after delta failed");
        test = false;
    } else {
        LM.writeLog("testClock" + testnum + ": split after delta success");
    }

    if (test)
        LM.writeLog("testClock: SUCCESS");
    else
        LM.writeLog("testClock: FAILED");

    return test;
}

function testVector() {
    var test = true;
    var testnum = 0;

    //test initialize vector (0,0,0)
    testnum++;
    var v1 = new Vector();
    var expectX = 0;
    var expectY = 0;
    var expectZ = 0;
    LM.writeLog("testVector" + testnum + ": initialize >> " + "(" + v1.getX() + "," + v1.getY()
        + "," + v1.getZ() + ")");
    LM.writeLog("testVector" + testnum + ": initialize >> expect " + "(" + expectX + "," + expectY
        + "," + expectZ + ")");
    if (v1.getX() != expectX || v1.getY() != expectY || v1.getZ() != expectZ) {
        LM.writeLog("testVector" + testnum + ": initialize failed");
        test = false;
    } else {
        LM.writeLog("testVector" + testnum + ": initialize success");
    }

    //test create vector (1,2,2)
    testnum++;
    var v2 = new Vector(1, 2, 2);
    var expectX = 1;
    var expectY = 2;
    var expectZ = 2;
    LM.writeLog("testVector" + testnum + ": initialize w/ parameters >> " + "(" + v2.getX() + "," + v2.getY()
        + "," + v2.getZ() + ")");
    LM.writeLog("testVector" + testnum + ": initialize w/ parameters  >> expect " + "(" + expectX + "," + expectY
        + "," + expectZ + ")");
    if (v2.getX() != expectX || v2.getY() != expectY || v2.getZ() != expectZ) {
        LM.writeLog("testVector" + testnum + ": initialize w/ parameters  failed");
        test = false;
    } else {
        LM.writeLog("testVector" + testnum + ": initialize w/ parameters  success");
    }

    //test get (1,2,2) magnitude = 3
    testnum++;
    var expectMag = 3;
    LM.writeLog("testVector" + testnum + ": getMagnitude >> " + v2.getMagnitude());
    LM.writeLog("testVector" + testnum + ": getMagnitude >> expect " + expectMag);
    if (v2.getMagnitude() != expectMag) {
        LM.writeLog("testVector" + testnum + ": getMagnitude failed");
        test = false;
    } else {
        LM.writeLog("testVector" + testnum + ": getMagnitude success");
    }

    //test set (1,2,2) to (2,3,6), magnitude = 7
    testnum++;
    v2.setX(2);
    v2.setY(3);
    v2.setZ(6);
    var expectX = 2;
    var expectY = 3;
    var expectZ = 6;
    var expectMag = 7;
    LM.writeLog("testVector" + testnum + ": setX/setY/setZ >> " + "(" + v2.getX() + "," + v2.getY()
        + "," + v2.getZ() + ")" + "," + v2.getMagnitude());
    LM.writeLog("testVector" + testnum + ": setX/setY/setZ >> expect " + "(" + expectX + "," + expectY
        + "," + expectZ + ")" + "," + expectMag);
    if (v2.getX() != expectX || v2.getY() != expectY
        || v2.getZ() != expectZ || v2.getMagnitude() != expectMag) {
        LM.writeLog("testVector" + testnum + ": setX/setY/setZ failed");
        test = false;
    } else {
        LM.writeLog("testVector" + testnum + ": setX/setY/setZ success");
    }

    //test set (0,0,0) to (-1,1,2)
    v1.setXYZ(-1, 1,2);
    testnum++;
    var expectX = -1;
    var expectY = 1;
    var expectZ = 2;
    LM.writeLog("testVector" + testnum + ": setXYZ >> " + "(" + v1.getX() + "," + v1.getY()
        + "," + v1.getZ() + ")");
    LM.writeLog("testVector" + testnum + ": setXYZ >> expect " + "(" + expectX + "," + expectY
        + "," + expectZ + ")");
    if (v1.getX() != expectX || v1.getY() != expectY || v1.getZ() != expectZ) {
        LM.writeLog("testVector" + testnum + ": setXYZ failed");
        test = false;
    } else {
        LM.writeLog("testVector" + testnum + ": setXYZ success");
    }

    //test (2,3,6) + (-1,1,2) = (1,4,8), magnitude = 9
    testnum++;
    v2 = v2.add(v1);
    var expectX = 1;
    var expectY = 4;
    var expectZ = 8;
    var expectMag = 9;
    LM.writeLog("testVector" + testnum + ": add >> " + "(" + v2.getX() + "," + v2.getY()
        + "," + v2.getZ() + ")" + "," + v2.getMagnitude());
    LM.writeLog("testVector" + testnum + ": add >> expect " + "(" + expectX + "," + expectY
        + "," + expectZ + ")" + "," + expectMag);
    if (v2.getX() != expectX || v2.getY() != expectY
        || v2.getZ() != expectZ || v2.getMagnitude() != expectMag) {
        LM.writeLog("testVector" + testnum + ": add failed");
        test = false;
    } else {
        LM.writeLog("testVector" + testnum + ": add success");
    }

    //test (1,4,8)*10 = (10,40,80), magnitude 90
    testnum++;
    v2.scale(10);
    var expectX = 10;
    var expectY = 40;
    var expectZ = 80;
    var expectMag = 90;
    LM.writeLog("testVector" + testnum + ": scale >> " + "(" + v2.getX() + "," + v2.getY()
        + "," + v2.getZ() + ")" + "," + v2.getMagnitude());
    LM.writeLog("testVector" + testnum + ": scale >> expect " + "(" + expectX + "," + expectY
        + "," + expectZ + ")" + "," + expectMag);
    if (v2.getX() != expectX || v2.getY() != expectY
        || v2.getZ() != expectZ || v2.getMagnitude() != expectMag) {
        LM.writeLog("testVector" + testnum + ": scale failed");
        test = false;
    } else {
        LM.writeLog("testVector" + testnum + ": scale success");
    }

    //test normalize, magnitude 1
    testnum++;
    v2.normalize();
    var expectMag = 1;
    LM.writeLog("testVector" + testnum + ": normalize >> " + v2.getMagnitude());
    LM.writeLog("testVector" + testnum + ": normalize >> expect " + expectMag);
    if (v2.getMagnitude() != expectMag) {
        LM.writeLog("testVector" + testnum + ": normalize failed");
        test = false;
    } else {
        LM.writeLog("testVector" + testnum + ": normalize success");
    }

    if (test)
        LM.writeLog("testVector: SUCCESS");
    else
        LM.writeLog("testVector: FAILED");

    return test;
}

function testGameObject() {
    var test = true;
    var testnum = 0;

    //test initialize object
    testnum++;
    var o = new GameObject();
    var expectId = 0;
    var expectType = "Object";
    var expectX = 0;
    var expectY = 0;
    var expectZ = 0;
    LM.writeLog("testObject" + testnum + ": initialize >> " + o.getId() + "," + o.getType() + ","
        + "(" + o.getPosition().getX() + "," + o.getPosition().getY()
        + "," + o.getPosition().getZ() + ")");
    LM.writeLog("testObject" + testnum + ": initialize >> expect " + expectId + "," + expectType + ","
        + "(" + expectX + "," + expectY + "," + expectZ + ")");
    if (o.getId() != expectId || o.getType() != expectType ||
        o.getPosition().getX() != expectX || o.getPosition().getY() != expectY
        || o.getPosition().getZ() != expectZ) {
        LM.writeLog("testObject" + testnum + ": initialize failed");
        test = false;
    } else {
        LM.writeLog("testObject" + testnum + ": initialize success");
    }

    //test set id
    testnum++;
    o.setId(100);
    var expectId = 100;
    LM.writeLog("testObject" + testnum + ": setId >> " + o.getId());
    LM.writeLog("testObject" + testnum + ": setId >> expect " + expectId);
    if (o.getId() != expectId) {
        LM.writeLog("testObject" + testnum + ": setId failed");
        test = false;
    } else {
        LM.writeLog("testObject" + testnum + ": setId success");
    }

    //test set type
    testnum++;
    o.setType("Super Object");
    var expectedType = "Super Object";
    LM.writeLog("testObject" + testnum + ": setType >> " + o.getType());
    LM.writeLog("testObject" + testnum + ": setType >> expect " + expectedType);
    if (o.getType() != expectedType) {
        LM.writeLog("testObject" + testnum + ": setType failed");
        test = false;
    } else {
        LM.writeLog("testObject" + testnum + ": setType success");
    }

    //test set position
    testnum++;
    o.setPosition(new Vector(1, 2,3));
    var expectX = 1;
    var expectY = 2;
    var expectZ = 3;
    LM.writeLog("testObject" + testnum + ": setPosition >> " + "(" + o.getPosition().getX()
        + "," + o.getPosition().getY()  + "," + o.getPosition().getZ() + ")");
    LM.writeLog("testObject" + testnum + ": setPosition >> expect " + "(" + expectX + "," + expectY
        + "," + expectZ + ")");
    if (o.getPosition().getX() != expectX || o.getPosition().getY() != expectY
        || o.getPosition().getZ() != expectZ) {
        LM.writeLog("testObject" + testnum + ": setPosition failed");
        test = false;
    } else {
        LM.writeLog("testObject" + testnum + ": setPosition success");
    }

    //test static id increment
    testnum++;
    var o2 = new GameObject();
    var o3 = new GameObject();
    var expectId2 = 1;
    var expectId3 = 2;
    LM.writeLog("testObject" + testnum + ": static id >> " + o2.getId() + ", " + o3.getId());
    LM.writeLog("testObject" + testnum + ": static id >> expect " + expectId2 + ", " + expectId3);
    if (o2.getId() != expectId2 || o3.getId() != expectId3) {
        LM.writeLog("testObject" + testnum + ": static id failed");
        test = false;
    } else {
        LM.writeLog("testObject" + testnum + ": static id success");
    }

    //test set speed
    testnum++;
    o.setSpeed(10);
    var expectSpeed = 10;
    LM.writeLog("testObject" + testnum + ": setSpeed >> " + o.getSpeed());
    LM.writeLog("testObject" + testnum + ": setSpeed >> expect " + expectSpeed);
    if (o.getSpeed() != expectSpeed) {
        LM.writeLog("testObject" + testnum + ": setSpeed failed");
        test = false;
    } else {
        LM.writeLog("testObject" + testnum + ": setSpeed success");
    }

    //test set direction
    testnum++;
    o.setDirection(new Vector(1, 0,-1));
    var expectX = 1;
    var expectY = 0;
    var expectZ = -1;
    LM.writeLog("testObject" + testnum + ": setDirection >> " + "(" + o.getDirection().getX()
        + "," + o.getDirection().getY() + "," + o.getDirection().getZ() + ")");
    LM.writeLog("testObject" + testnum + ": setDirection >> expect " + "(" + expectX + "," + expectY
        + "," + expectZ + ")");
    if (o.getDirection().getX() != expectX || o.getDirection().getY() != expectY
        || o.getDirection().getZ() != expectZ) {
        LM.writeLog("testObject" + testnum + ": setDirection failed");
        test = false;
    } else {
        LM.writeLog("testObject" + testnum + ": setDirection success");
    }

    //test set velocity
    testnum++;
    o.setVelocity(new Vector(2, 3, 6));
    var expectX = 2;
    var expectY = 3;
    var expectZ = 6;
    LM.writeLog("testObject" + testnum + ": setVelocity >> " + "(" + o.getVelocity().getX()
        + "," + o.getVelocity().getY() + "," + o.getVelocity().getZ() + ")");
    LM.writeLog("testObject" + testnum + ": setVelocity >> expect " + "(" + expectX + "," + expectY
        + "," + expectZ + ")");
    if (o.getVelocity().getX() != expectX || o.getVelocity().getY() != expectY
        || o.getVelocity().getZ() != expectZ) {
        LM.writeLog("testObject" + testnum + ": setVelocity failed");
        test = false;
    } else {
        LM.writeLog("testObject" + testnum + ": setVelocity success");
    }

    //test predict pos
    // pos(1,2,3), velocity(2,3,6) >> predict(3,5,9)
    testnum++;
    var predict = o.predictPosition();
    var expectX = 3;
    var expectY = 5;
    var expectZ = 9;
    LM.writeLog("testObject" + testnum + ": predictPosition >> " + "(" + predict.getX()
        + "," + predict.getY() + "," + predict.getZ() + ")");
    LM.writeLog("testObject" + testnum + ": predictPosition >> expect " + "(" + expectX + "," + expectY
        + "," + expectZ + ")");
    if (predict.getX() != expectX || predict.getY() != expectY
        || predict.getZ() != expectZ) {
        LM.writeLog("testObject" + testnum + ": predictPosition failed");
        test = false;
    } else {
        LM.writeLog("testObject" + testnum + ": predictPosition success");
    }

    //test set solidness
    testnum++;
    o.setSolidness(Solidness.SOFT);
    var expectSolidness = Solidness.SOFT;
    var expectIsSolid = true;
    LM.writeLog("testObject" + testnum + ": setSolidness >> " + o.getSolidness() + "," + o.isSolid());
    LM.writeLog("testObject" + testnum + ": setSolidness >> " + expectSolidness + "," + expectIsSolid);
    if (o.getSolidness() != expectSolidness || o.isSolid() != expectIsSolid) {
        LM.writeLog("testObject" + testnum + ": setSolidness failed");
        test = false;
    } else {
        LM.writeLog("testObject" + testnum + ": setSolidness success");
    }

    //test set rotate speed
    testnum++;
    o.setRotateSpeed(10);
    var expectRotateSpeed = 10;
    LM.writeLog("testObject" + testnum + ": setRotateSpeed >> " + o.getRotateSpeed());
    LM.writeLog("testObject" + testnum + ": setRotateSpeed >> " + expectRotateSpeed);
    if (o.getRotateSpeed() != expectRotateSpeed) {
        LM.writeLog("testObject" + testnum + ": setRotateSpeed failed");
        test = false;
    } else {
        LM.writeLog("testObject" + testnum + ": setRotateSpeed success");
    }

    //test update model
    //pos(1,2,3) >> translate(1,2,3), rotateSpeed(+10) >> rotateAngle(10)
    var model = new Model();
    model.setTranslate(vec3(0,0,0));
    model.setRotateAxis(vec3(0,1,0));
    model.setRotateAngle(0);
    o.setModel(model);
    o.updateModel();
    var expectX = 1;
    var expectY = 2;
    var expectZ = 3;
    var expectAngle = 10;
    LM.writeLog("testObject" + testnum + ": updateModel >> " + "(" + o.getModel().getTranslate()[0]
        + "," + o.getModel().getTranslate()[1] + "," + o.getModel().getTranslate()[2] + ")"
        + "," + o.getModel().getRotateAngle());
    LM.writeLog("testObject" + testnum + ": updateModel >> expect " + "(" + expectX + "," + expectY
        + "," + expectZ + ")"
        + "," + expectAngle);
    if (o.getModel().getTranslate()[0] != expectX || o.getModel().getTranslate()[1] != expectY
        || o.getModel().getTranslate()[2] != expectZ || o.getModel().getRotateAngle() != expectAngle) {
        LM.writeLog("testObject" + testnum + ": updateModel failed");
        test = false;
    } else {
        LM.writeLog("testObject" + testnum + ": updateModel success");
    }

    //test update model twice
    //pos(1,2,3) >> translate(1,2,3), rotateSpeed(+10) >> rotateAngle(20)
    o.updateModel();
    var expectX = 1;
    var expectY = 2;
    var expectZ = 3;
    var expectAngle = 20;
    LM.writeLog("testObject" + testnum + ": updateModel twice >> " + "(" + o.getModel().getTranslate()[0]
        + "," + o.getModel().getTranslate()[1] + "," + o.getModel().getTranslate()[2] + ")"
        + "," + o.getModel().getRotateAngle());
    LM.writeLog("testObject" + testnum + ": updateModel twice >> expect " + "(" + expectX + "," + expectY
        + "," + expectZ + ")"
        + "," + expectAngle);
    if (o.getModel().getTranslate()[0] != expectX || o.getModel().getTranslate()[1] != expectY
        || o.getModel().getTranslate()[2] != expectZ || o.getModel().getRotateAngle() != expectAngle) {
        LM.writeLog("testObject" + testnum + ": updateModel twice failed");
        test = false;
    } else {
        LM.writeLog("testObject" + testnum + ": updateModel twice success");
    }


    if (test)
        LM.writeLog("testObject: SUCCESS");
    else
        LM.writeLog("testObject: FAILED");

    return test;
}

function testWM() {
    var test = true;
    var testnum = 0;

    // Start up WorldManager.
    if (WM.startUp() != 0) {
        LM.writeLog("Error starting world manager!\n");
        return false;
    }

    //test create new object, should be in WM object list
    testnum++;
    var o = new GameObject();
    var list = WM.getAllObjects();
    var expectLength = 1;
    LM.writeLog("testWM" + testnum + ": insert object into WM >> " + list.length);
    LM.writeLog("testWM" + testnum + ": insert object into WM >> expect " + expectLength);
    if (list.length != 1) {
        LM.writeLog("testWM" + testnum + ": insert object into WM failed");
        test = false;
    } else {
        LM.writeLog("testWM" + testnum + ": insert object into WM success");
    }

    //test modified object, should be the same object with one already in the list
    testnum++;
    o.setType("Speed Object");
    var list = WM.getAllObjects();
    var expectType = list[0].getType();
    LM.writeLog("testWM" + testnum + ": modified object in WM >> " + o.getType());
    LM.writeLog("testWM" + testnum + ": modified object in WM >> expect " + expectType);
    if (o.getType() != expectType) {
        LM.writeLog("testWM" + testnum + ": modified object in WM failed");
        test = false;
    } else {
        LM.writeLog("testWM" + testnum + ": modified object in WM success");
    }

    //test move object
    testnum++;
    WM.moveObject(o, new Vector(1,2,3));
    var expectX = 1;
    var expectY = 2;
    var expectZ = 3;
    LM.writeLog("testWM" + testnum + ": move object >> " + "(" + o.getPosition().getX()
        + "," + o.getPosition().getY() + "," + o.getPosition().getZ() + ")");
    LM.writeLog("testWM" + testnum + ": move object >> expect " + "(" + expectX
        + "," +expectY + "," + expectZ + ")");
    if (o.getPosition().getX() != expectX || o.getPosition().getY() != expectY
        || o.getPosition().getZ() != expectZ) {
        LM.writeLog("testWM" + testnum + ": move object failed");
        test = false;
    } else {
        LM.writeLog("testWM" + testnum + ": move object success");
    }

    //test delete object
    testnum++;
    WM.markForDelete(o);
    WM.update();
    var list = WM.getAllObjects();
    var expectLength = 0;
    LM.writeLog("testWM" + testnum + ": delete object from WM >> " + list.length);
    LM.writeLog("testWM" + testnum + ": delete object from WM >> expect " + expectLength);
    if (list.length != expectLength) {
        LM.writeLog("testWM" + testnum + ": delete object from WM failed");
        test = false;
    } else {
        LM.writeLog("testWM" + testnum + ": delete object from WM success");
    }

    // Shutdown WorldManager.
    WM.shutDown();

    if (test)
        LM.writeLog("testWM: SUCCESS");
    else
        LM.writeLog("testWM: FAILED");

    return test;
}

function testDM() {
    // Start up DisplayManager.
    if (DM.startUp() != 0) {
        LM.writeLog("Error starting display manager!\n");
        return false;
    }

    var cube = utility.cube();
    var red = utility.color("red");
    DM.render(cube, red, vec3(), vec3(1, 1, 1), 60);
}

async function testGM() {
    var clock = new Clock();
    var test = true;
    var testnum = 0;

    //test startUp GM, will also start up LM that already started
    LM.writeLog("testGM" + testnum + ": game start >> " + clock.delta());
    LM.writeLog("testGM" + testnum + ": expect LM already started");

    // Start up GameManager.
    if (GM.startUp() != 0) {
        LM.writeLog("Error starting game manager!\n");
        return false;
    }


    //test frontend display
    var object = new ObjectForTest(
        new Vector(-1.1,0.6,0.1),
        new Vector(-0.01,0,0),
        1,
        utility.cube(),
        utility.color("red"),
        45,
        vec3(0.5,0.5,0.5));

    var object2 = new ObjectForTest(
        new Vector(1,0.5,0),
        new Vector(0.01,0,0),
        -1,
        utility.cube(),
        utility.color("blue"),
        60,
        vec3(0.5,0.5,0.5));

    var object3 = new ObjectForTest(
        new Vector(-1,-0.5,0.1),
        new Vector(-0.01,0,0),
        1,
        utility.cube(),
        utility.color("green"),
        0,
        vec3(0.5,0.5,0.5));
    object3.setSolidness(Solidness.SOFT);

    var object4 = new ObjectForTest(
        new Vector(1,-0.5,0),
        new Vector(0.01,0,0),
        -1,
        utility.cube(),
        utility.color("yellow"),
        45,
        vec3(0.5,0.5,0.5));
    object4.setSolidness(Solidness.SOFT);

    var camera = new TestCamera();
    camera.setAtFollowing(object4);

    await GM.run();

    //test frame time value
    testnum++;
    var expectFrameTime1 = 33;
    LM.writeLog("testGM" + testnum + ": frame time >> " + GM.getFrameTime());
    LM.writeLog("testGM" + testnum + ": frame time >> expect " + expectFrameTime1);
    if (GM.getFrameTime() != expectFrameTime1) {
        LM.writeLog("testGM" + testnum + ": frame time failed");
        test = false;
    } else {
        LM.writeLog("testGM" + testnum + ": frame time success");
    }

    if (test)
        LM.writeLog("testGM: SUCCESS");
    else
        LM.writeLog("testGM: FAILED");

    // Shutdown GameManager.
    GM.shutDown();

    return test;
}