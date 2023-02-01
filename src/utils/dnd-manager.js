import { DragSource as dragSource, DropTarget as dropTarget } from 'react-dnd';
import { findDOMNode } from 'react-dom';
import { getDepth } from './tree-data-utils';
import { memoizedInsertNode } from './memoized-tree-data-utils';

export default class DndManager {
  constructor(treeRef) {
    this.treeRef = treeRef;
    this.lastAutoSnapResult = false;
    this.lastCanDrop = false;
    this.lastHoverClientOffset = null;
  }

  get startDrag() {
    return this.treeRef.startDrag;
  }

  get dragHover() {
    return this.treeRef.dragHover;
  }

  get endDrag() {
    return this.treeRef.endDrag;
  }

  get drop() {
    return this.treeRef.drop;
  }

  get treeId() {
    return this.treeRef.treeId;
  }

  get dndType() {
    return this.treeRef.dndType;
  }

  get treeData() {
    return this.treeRef.state.draggingTreeData || this.treeRef.props.treeData;
  }

  get getNodeKey() {
    return this.treeRef.props.getNodeKey;
  }

  get customCanDrop() {
    return this.treeRef.props.canDrop;
  }

  get maxDepth() {
    return this.treeRef.props.maxDepth;
  }

  get autoSnapEnabled() {
    return this.treeRef.autoSnapEnabled;
  }

  get autoSnapRowsAfter() {
    return this.treeRef.autoSnapRowsAfter;
  }

  get autoSnapRowsBefore() {
    return this.treeRef.autoSnapRowsBefore;
  }

  get getRows() {
    return this.treeRef.getRows;
  }

  autoSnapRaw({ monitor, targetDepth, targetIndex}) {
    const {autoSnapRowsAfter, autoSnapRowsBefore, treeData} = this;

    const draggedNode = monitor.getItem().node;

    const rows = this.getRows(treeData);

    const coordsToCheck = [];

    const coordsToCheckAddAllLevelsForIndex = ({ flatTreeIndex, maxDepth }) => {
      let currentTargetDepth = maxDepth;

      do {
        coordsToCheck.push({
          depth: currentTargetDepth,
          minimumTreeIndex: flatTreeIndex
        })
        currentTargetDepth -= 1;
      } while (currentTargetDepth > -1);
    }

    coordsToCheckAddAllLevelsForIndex({
      flatTreeIndex: targetIndex,
      maxDepth: targetDepth
    });

    for (
      let i = targetIndex - 1;
      i >= Math.max(targetIndex - autoSnapRowsBefore, 0);
      i-=1
    ) {
      const row = rows[i-1];

      coordsToCheckAddAllLevelsForIndex({
        flatTreeIndex: row ? i : 0,
        maxDepth: row ? row.path.length : 0,
      });
    }

    for (
      let i = targetIndex + 1;
      i <= Math.min(targetIndex + autoSnapRowsAfter, rows.length);
      i+=1
    ) {
      const row = rows[i-1];

      coordsToCheckAddAllLevelsForIndex({
        flatTreeIndex: row ? i : rows.length,
        maxDepth: row ? row.path.length : 0,
      });
    }

    for (let i = 0; i < coordsToCheck.length; i+=1) {
      const { depth, minimumTreeIndex } = coordsToCheck[i];

      const addedResult = memoizedInsertNode({
        treeData,
        newNode: draggedNode,
        depth,
        getNodeKey: this.getNodeKey,
        minimumTreeIndex,
        expandParent: true,
      });

      coordsToCheck[i].addedResult = addedResult;

      if (this.customCanDrop({
        node: draggedNode,
        prevPath: monitor.getItem().path,
        prevParent: monitor.getItem().parentNode,
        prevTreeIndex: monitor.getItem().treeIndex, // Equals -1 when dragged from external tree
        nextPath: addedResult.path,
        nextParent: addedResult.parentNode,
        nextTreeIndex: addedResult.treeIndex,
      })
      ) {
        const resultPath = [...addedResult.path];
        resultPath.pop();

        coordsToCheck[i].result = {
          path: resultPath,
          targetIndex: addedResult.treeIndex,
          targetDepth: resultPath.length || -1,
        }
      } else {
        coordsToCheck[i].result = false;
      }
    }


    let result = false;

    for (let i = 0; i < coordsToCheck.length; i+=1) {
      if (coordsToCheck[i].result) {
        result = coordsToCheck[i].result;
        break;
      }
    }

    console.log('dnd-manager: autoSnap:', { draggedNode, targetDepth, targetIndex, coordsToCheck, result });

    return result;
  };

  autoSnap(args) {
    this.lastAutoSnapResult =  this.autoSnapRaw(args);
    // console.log('dnd-manager: hover(): lastAutoSnapResult:', this.lastAutoSnapResult);
    return this.lastAutoSnapResult;
  }

  getTargetDepth(dropTargetProps, monitor, component) {
    let dropTargetDepth = 0;

    const rowAbove = dropTargetProps.getPrevRow();
    if (rowAbove) {
      let { path } = rowAbove;
      const aboveNodeCannotHaveChildren = !this.treeRef.canNodeHaveChildren(
        rowAbove.node
      );
      if (aboveNodeCannotHaveChildren) {
        path = path.slice(0, path.length - 1);
      }

      // Limit the length of the path to the deepest possible
      dropTargetDepth = Math.min(path.length, dropTargetProps.path.length);
    }

    let blocksOffset;
    let dragSourceInitialDepth = (monitor.getItem().path || []).length;

    // When adding node from external source
    if (monitor.getItem().treeId !== this.treeId) {
      // Ignore the tree depth of the source, if it had any to begin with
      dragSourceInitialDepth = 0;

      if (component) {
        const relativePosition = findDOMNode(component).getBoundingClientRect(); // eslint-disable-line react/no-find-dom-node
        const leftShift =
          monitor.getSourceClientOffset().x - relativePosition.left;
        blocksOffset = Math.round(
          leftShift / dropTargetProps.scaffoldBlockPxWidth
        );
      } else {
        blocksOffset = dropTargetProps.path.length;
      }
    } else {
      // handle row direction support
      const direction = dropTargetProps.rowDirection === 'rtl' ? -1 : 1;

      blocksOffset = Math.round(
        (direction * monitor.getDifferenceFromInitialOffset().x) /
          dropTargetProps.scaffoldBlockPxWidth
      );
    }

    let targetDepth = Math.min(
      dropTargetDepth,
      Math.max(0, dragSourceInitialDepth + blocksOffset - 1)
    );

    // If a maxDepth is defined, constrain the target depth
    if (typeof this.maxDepth !== 'undefined' && this.maxDepth !== null) {
      const draggedNode = monitor.getItem().node;
      const draggedChildDepth = getDepth(draggedNode);

      targetDepth = Math.max(
        0,
        Math.min(targetDepth, this.maxDepth - draggedChildDepth - 1)
      );
    }

    return targetDepth;
  }

  canDropRaw(dropTargetProps, monitor) {
    if (!monitor.isOver()) {
      return false;
    }

    const rowAbove = dropTargetProps.getPrevRow();
    const abovePath = rowAbove ? rowAbove.path : [];
    const aboveNode = rowAbove ? rowAbove.node : {};
    const targetDepth = this.getTargetDepth(dropTargetProps, monitor, null);

    // Cannot drop if we're adding to the children of the row above and
    //  the row above is a function
    if (
      targetDepth >= abovePath.length &&
      typeof aboveNode.children === 'function'
    ) {
      return false;
    }

    if (this.autoSnapEnabled) {
      // позже произойдёт проверка
      this.autoSnap({
        dropTargetProps,
        monitor,
        targetDepth,
        targetIndex:
        dropTargetProps.listIndex
      });

      return !!this.lastAutoSnapResult;
    }

    if (typeof this.customCanDrop === 'function') {
      const { node } = monitor.getItem();
      const addedResult = memoizedInsertNode({
        treeData: this.treeData,
        newNode: node,
        depth: targetDepth,
        getNodeKey: this.getNodeKey,
        minimumTreeIndex: dropTargetProps.listIndex,
        expandParent: true,
      });

      return this.customCanDrop({
        node,
        prevPath: monitor.getItem().path,
        prevParent: monitor.getItem().parentNode,
        prevTreeIndex: monitor.getItem().treeIndex, // Equals -1 when dragged from external tree
        nextPath: addedResult.path,
        nextParent: addedResult.parentNode,
        nextTreeIndex: addedResult.treeIndex,
      });
    }

    return true;
  }

  canDrop(dropTargetProps, monitor) {
    this.lastCanDrop = this.canDropRaw(dropTargetProps, monitor);
    return this.lastCanDrop;
  }

  wrapSource(el) {
    const nodeDragSource = {
      beginDrag: props => {
        this.lastHoverClientOffset = null;

        this.startDrag(props);

        return {
          node: props.node,
          parentNode: props.parentNode,
          path: props.path,
          treeIndex: props.treeIndex,
          treeId: props.treeId,
        };
      },

      endDrag: (props, monitor) => {
        this.endDrag(monitor.getDropResult());
      },

      isDragging: (props, monitor) => {
        const dropTargetNode = monitor.getItem().node;
        const draggedNode = props.node;

        return draggedNode === dropTargetNode;
      },
    };

    function nodeDragSourcePropInjection(connect, monitor) {
      return {
        connectDragSource: connect.dragSource(),
        connectDragPreview: connect.dragPreview(),
        isDragging: monitor.isDragging(),
        didDrop: monitor.didDrop(),
      };
    }

    return dragSource(
      this.dndType,
      nodeDragSource,
      nodeDragSourcePropInjection
    )(el);
  }

  wrapTarget(el) {
    const nodeDropTarget = {
      drop: (dropTargetProps, monitor, component) => {
        console.log('dnd-manager: drop(): ', dropTargetProps);

        let result = {
          node: monitor.getItem().node,
          path: monitor.getItem().path,
          treeIndex: monitor.getItem().treeIndex,
          treeId: this.treeId,
          minimumTreeIndex: dropTargetProps.treeIndex,
          depth: this.getTargetDepth(dropTargetProps, monitor, component),
        };

        if (this.lastAutoSnapResult) {

          const {path, targetIndex, targetDepth} = this.lastAutoSnapResult;

          result = {
            ...result,
            path,
            treeIndex: targetIndex,
            depth: targetDepth,
          }
        }

        this.drop(result);

        return result;
      },

      hover: (dropTargetProps, monitor, component) => {
        /**
         * fix "Can't drop external dragsource below tree"
         * from https://github.com/frontend-collective/react-sortable-tree/issues/483#issuecomment-581139473
         * */

        // eslint-disable-next-line no-param-reassign,no-underscore-dangle
        // dropTargetProps.__test_changed = (dropTargetProps.__test_changed || 0) + 1

        let targetIndex = 0;
        let targetDepth = this.getTargetDepth(
          dropTargetProps,
          monitor,
          component
        );
        const draggedNode = monitor.getItem().node;

        // TODO scroll position?
        const clientOffset = monitor.getClientOffset();

        const needsRedraw =
          (
            // Redraw if hovered above different nodes
            dropTargetProps.node !== draggedNode ||
            // Or hovered above the same node but at a different depth
            targetDepth !== dropTargetProps.path.length - 1
          ) && (
            !this.lastHoverClientOffset ||
            (
              Math.abs(this.lastHoverClientOffset.x - clientOffset.x) > 0.1 ||
              Math.abs(this.lastHoverClientOffset.x - clientOffset.x) > 0.1
            )
          );

        this.lastHoverClientOffset = clientOffset;

        if (!needsRedraw) {
          return;
        }

        // eslint-disable-next-line react/no-find-dom-node
        const hoverBoundingRect = findDOMNode(
          component
        ).getBoundingClientRect();
        // Get vertical middle
        const hoverMiddleY =
          (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;

        // Get pixels to the top
        const hoverClientY = clientOffset.y - hoverBoundingRect.top;

        // dragUp
        if (hoverClientY <= hoverMiddleY) {
          targetIndex = dropTargetProps.treeIndex;
        }

        // dragDown
        if (hoverClientY >= hoverMiddleY) {
          targetIndex = dropTargetProps.treeIndex + 1;
        }

        let { path } = monitor.getItem();

        if (this.autoSnapEnabled && typeof this.customCanDrop === 'function') {
            this.autoSnap({dropTargetProps, monitor, targetDepth, targetIndex});
        }

        if (this.lastAutoSnapResult) {
          ({ path, targetIndex, targetDepth} = this.lastAutoSnapResult);
        }

        // throttle `dragHover` work to available animation frames
        cancelAnimationFrame(this.rafId);
        this.rafId = requestAnimationFrame(() => {
          this.dragHover({
            node: draggedNode,
            path,
            minimumTreeIndex: targetIndex,
            // minimumTreeIndex: dropTargetProps.listIndex,
            depth: targetDepth,
          });
        });
      },

      canDrop: this.canDrop.bind(this),
    };

    function nodeDropTargetPropInjection(connect, monitor) {
      const dragged = monitor.getItem();
      return {
        connectDropTarget: connect.dropTarget(),
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
        draggedNode: dragged ? dragged.node : null,
      };
    }

    return dropTarget(
      this.dndType,
      nodeDropTarget,
      nodeDropTargetPropInjection
    )(el);
  }

  wrapPlaceholder(el) {
    const placeholderDropTarget = {
      drop: (dropTargetProps, monitor) => {
        const { node, path, treeIndex } = monitor.getItem();
        const result = {
          node,
          path,
          treeIndex,
          treeId: this.treeId,
          minimumTreeIndex: 0,
          depth: 0,
        };

        this.drop(result);

        return result;
      },
    };

    function placeholderPropInjection(connect, monitor) {
      const dragged = monitor.getItem();
      return {
        connectDropTarget: connect.dropTarget(),
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
        draggedNode: dragged ? dragged.node : null,
      };
    }

    return dropTarget(
      this.dndType,
      placeholderDropTarget,
      placeholderPropInjection
    )(el);
  }
}
