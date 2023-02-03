/* eslint-disable react/no-multi-comp */
import PropTypes from 'prop-types';
import React, { Component } from 'react';
import { DndProvider, DragSource } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { SortableTreeWithoutDndContext as SortableTree } from '../src';
// In your own app, you would need to use import styles once in the app
// import 'react-sortable-tree/styles.css';

// -------------------------
// Create an drag source component that can be dragged into the tree
// https://react-dnd.github.io/react-dnd/docs-drag-source.html
// -------------------------
// This type must be assigned to the tree via the `dndType` prop as well
const externalNodeType = 'yourNodeType';
const externalNodeSpec = {
  // This needs to return an object with a property `node` in it.
  // Object rest spread is recommended to avoid side effects of
  // referencing the same object in different trees.
  beginDrag: componentProps => ({ node: { ...componentProps.node } }),
};
const externalNodeCollect = (connect /* , monitor */) => ({
  connectDragSource: connect.dragSource(),
  // Add props via react-dnd APIs to enable more visual
  // customization of your component
  // isDragging: monitor.isDragging(),
  // didDrop: monitor.didDrop(),
});
class externalNodeBaseComponent extends Component {
  render() {
    const { connectDragSource, node } = this.props;

    return connectDragSource(
      <div
        style={{
          display: 'inline-block',
          padding: '3px 5px',
          background: 'blue',
          color: 'white',
        }}
      >
        {node.title}
      </div>,
      { dropEffect: 'copy' }
    );
  }
}
externalNodeBaseComponent.propTypes = {
  node: PropTypes.shape({ title: PropTypes.string }).isRequired,
  connectDragSource: PropTypes.func.isRequired,
};
const YourExternalNodeComponent = DragSource(
  externalNodeType,
  externalNodeSpec,
  externalNodeCollect
)(externalNodeBaseComponent);

function canDrop(args) {
  const { node, nextParent } = args;

  if (node.isPerson) {
    return nextParent && !nextParent.isPerson;
  }
  return !nextParent;
}


function calcRowHeight(args) {
  console.log('calcRowHeight:', args);

  if (args.node === args.draggedNode) {
    return 10;
  }

  return 62;
}

class App extends Component {
  constructor(props) {
    super(props);

    this.state = {
      treeData: [
        {
          title: 'Managers',
          id: 1000,
          expanded: true,
          children: [
            {
              id: 1,
              title: 'Rob',
              children: [],
              isPerson: true,
            },
            {
              id: 2,
              title: 'Joe',
              children: [],
              isPerson: true,
            },
          ],
        },
        {
          title: 'Clerks',
          id: 2000,
          expanded: true,
          children: [
            {
              id: 3,
              title: 'Bertha',
              children: [],
              isPerson: true,
            },
            {
              id: 4,
              title: 'Billy',
              children: [],
              isPerson: true,
            },
          ],
        },
      ],
    };

    this.onChange= this.onChange.bind(this);

    this.refReactVirtualizedList = React.createRef();

    this.reactVirtualizedListProps = {
      // autoHeight: true,
      ref: this.refReactVirtualizedList,
    }
  }

  onChange(newTreeData) {
    this.setState({treeData: newTreeData});
  }

  render() {
    return (
      <DndProvider backend={HTML5Backend}>
        <div>
          <div style={{ height: 500 }}>
            <SortableTree
              canDrop={canDrop}
              dndType={externalNodeType}
              isVirtualized={this.props.isVirtualized}
              reactVirtualizedListProps={this.reactVirtualizedListProps}
              onChange={this.onChange}
              rowHeight={calcRowHeight}
              treeData={this.state.treeData}
            />
          </div>
          <YourExternalNodeComponent node={{ title: 'New worker', isPerson: true, }} />← drag
          this
        </div>
      </DndProvider>
    );
  }
}

App.propTypes = {
  isVirtualized: PropTypes.bool.isRequired,
}

export default App;
