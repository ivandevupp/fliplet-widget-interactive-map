import Multiselect from 'vue-multiselect'

Fliplet.Floorplan.component('add-markers', {
  componentName: 'Add Markers',
  props: {
    id: {
      type: Number,
      default: undefined
    },
    widgetData: {
      type: Object,
      default: undefined
    },
    markersDataSourceId: {
      type: Number,
      default: undefined
    },
    markerNameColumn: {
      type: String,
      default: ''
    },
    markerFloorColumn: {
      type: String,
      default: ''
    },
    markerTypeColumn: {
      type: String,
      default: ''
    },
    markerXPositionColumn: {
      type: String,
      default: ''
    },
    markerYPositionColumn: {
      type: String,
      default: ''
    },
    dataSources: {
      type: Array,
      default: []
    },
    autoDataSource: {
      type: Boolean,
      default: false
    }
  },
  components: {
    Multiselect
  },
  data() {
    return {
      isLoading: true,
      manualSelectDataSource: false,
      manualSetSettings: false,
      savedData: this.widgetData.savedData,
      markersDataSource: _.find(this.dataSources, { id: this.markersDataSourceId }),
      dataSourceConnection: undefined,
      pinchzoomer: null,
      pzHandler: undefined,
      markerElemHandler: undefined,
      markersData: undefined,
      mappedMarkerData: [],
      activeMarker: 0,
      selectedMarkerData: {
        floor: undefined,
        marker: undefined
      },
      saveDebounced: _.debounce(this.saveToDataSource, 1000)
    }
  },
  computed: {
    markerFieldColumns() {
      return this.markersDataSource ? this.markersDataSource.columns : []
    },
    selectedFloor() {
      return this.widgetData.floors[this.selectedFloorIndex]
    }
  },
  watch: {
    markersDataSource(ds, oldDs) {
      if (!ds || !oldDs || ds.id !== oldDs.id) {
        // Resets select fields
        this.markerNameColumn = ''
        this.markerFloorColumn = ''
        this.markerTypeColumn = ''
        this.markerXPositionColumn = ''
        this.markerYPositionColumn = ''
      }
    }
  },
  methods: {
    mapMarkerData() {
      const newMarkerData = this.markersData.map((marker) => {
        const markerData = _.find(this.widgetData.markers, { name: marker.data[this.markerTypeColumn] })
        return {
          id: marker.id,
          data: {
            name: marker.data[this.markerNameColumn],
            floor: marker.data[this.markerFloorColumn],
            type: marker.data[this.markerTypeColumn],
            icon: markerData ? markerData.icon : '',
            color: markerData ? markerData.color : '#333333',
            size: markerData ? markerData.size : '24px',
            positionx: marker.data[this.markerXPositionColumn],
            positiony: marker.data[this.markerYPositionColumn],
            updateName: false,
            copyOfName: ''
          }
        }
      })

      return newMarkerData
    },
    setActiveMarker(index, forced) {
      if (this.activeMarker !== index || forced) {
        this.activeMarker = index
        this.setupPinchZoomer()
      }
    },
    updateFloor(floorName, index) {
      this.mappedMarkerData[index].data.floor = floorName
      this.saveDebounced()
      this.setupPinchZoomer()
    },
    updateMarker(marker, index) {
      this.mappedMarkerData[index].data.type = marker.name
      this.mappedMarkerData[index].data.icon = marker.icon
      this.mappedMarkerData[index].data.color = marker.color
      this.mappedMarkerData[index].data.size = marker.size
      this.saveDebounced()
      this.setupPinchZoomer()
    },
    toUpdateName(index, currentName) {
      this.mappedMarkerData[index].data.updateName = !this.mappedMarkerData[index].data.updateName
      this.mappedMarkerData[index].data.copyOfName = currentName
      this.$nextTick(() => this.$refs['changename-' + index][0].focus())
    },
    confirmName(index, fromCancel) {
      this.mappedMarkerData[index].data.updateName = !this.mappedMarkerData[index].data.updateName

      if (!fromCancel) {
        this.saveDebounced()
        this.setupPinchZoomer()
      }
    },
    cancelNameUpdate(index) {
      this.mappedMarkerData[index].data.name = this.mappedMarkerData[index].data.copyOfName
      this.mappedMarkerData[index].data.copyOfName = ''
      this.confirmName(index, true)
    },
    deleteMarker(index) {
      const markerId = $('.floor-wrapper-holder')
        .find('.marker[data-tooltip="' + this.mappedMarkerData[index].data.name + '"]')
        .attr('id')
      const markerIndex = this.getMarkerIndex(markerId)
        
      if (markerIndex >= 0) {
        this.pinchzoomer.removeMarker(markerIndex, true)
      }

      this.mappedMarkerData.splice(index, 1)
      this.setActiveMarker(0, true)
      this.saveDebounced()
    },
    nameWithId({ name, id }) {
      return `${name} — [${id}]`
    },
    createNewData() {
      const name = `${this.appName} - Markers`

      Fliplet.Modal.prompt({
        title: 'Please type a name for your data source:',
        value: name
      }).then((name) => {
        if (name === null || name === '') {
          return Promise.reject()
        }

        return name
      }).then((name) => {
        return Fliplet.DataSources.create({
          name: name,
          organizationId: organizationId
        })
      }).then((ds) => {
        this.dataSources.push(ds)
        this.selectedDataSource = ds.id
      })
    },
    chooseExistingData() {
      Fliplet.Modal.confirm({
        title: 'Changing data source',
        message: '<p>If you continue the data source we created for you will be deleted.</p><p>Are you sure you want to continue?</p>'
      }).then((result) => {
        if (!result) {
          return
        }

        return this.deleteDataSource()
      }).then(() => {
        // Remove from dataSources
        this.dataSources = _.filter(this.dataSources, (ds) => {
          return ds.id !== this.markersDataSourceId
        })
        this.markersDataSource = null

        this.manualSelectDataSource = true
      }) 
    },
    editDataSource() {
      Fliplet.Studio.emit('overlay', {
        name: 'widget',
        options: {
          size: 'large',
          package: 'com.fliplet.data-sources',
          title: 'Edit Data Sources',
          classes: 'data-source-overlay',
          data: {
            context: 'overlay',
            dataSourceId: this.markersDataSourceId
          }
        }
      })
    },
    deleteDataSource() {
      return Fliplet.DataSources.delete(this.markersDataSourceId)
    },
    reloadDataSources() {
      return Fliplet.DataSources.get({
        roles: 'publisher,editor',
        type: null
      }, {
        cache: false
      })
    },
    useSettings() {
      this.savedData = true
      Fliplet.Studio.emit('widget-mode', 'wide')
    },
    changeSettings() {
      this.savedData = false
      Fliplet.Studio.emit('widget-mode', 'normal')
    },
    setupPinchZoomer() {
      if (!this.mappedMarkerData.length) {
        return
      }

      const floorName = this.mappedMarkerData[this.activeMarker].data.floor
      this.selectedMarkerData.marker = this.mappedMarkerData[this.activeMarker]
      this.selectedMarkerData.floor = _.find(this.widgetData.floors, { name: floorName })

      if (this.pinchzoomer) {
        this.detachEventHandlers()
        this.pinchzoomer = null
      }

      this.pinchzoomer = new PinchZoomer($('#floor-' + this.selectedMarkerData.floor.id), {
        adjustHolderSize: false,
        maxZoom: 4,
        initZoom: 1,
        zoomStep: 0.25,
        allowMouseWheelZoom: false,
        animDuration: 0.1,
        scaleMode: 'proportionalInside',
        zoomToMarker: true,
        allowCenterDrag: true
      })

      this.pzHandler = new Hammer(this.pinchzoomer.elem().get(0))

      this.addMarkers(true)
      this.attachEventHandler()
    },
    addMarkers(fromLoad, options) {
      let markerElem = undefined
      options = options || {}

      if (fromLoad) {
        this.pinchzoomer.removeMarkers(true)

        this.mappedMarkerData.forEach((marker, index) => {
          if (marker.data.floor === this.selectedMarkerData.floor.name) {
            markerElem = $("<i id='marker-" + index + "' class='marker " + marker.data.icon + "' style='left: -15px; top: -15px; position: absolute; color: " + marker.data.color + "; font-size: " + marker.data.size + ";' data-tooltip='" + marker.data.name + "'></i>")
            this.markerElemHandler = new Hammer(markerElem.get(0))
            this.pinchzoomer.addMarkers([new Marker(markerElem, { x: marker.data.positionx, y: marker.data.positiony, transformOrigin: '50% 50%', name: marker.data.name })])
            this.markerElemHandler.on('tap', this.onMarkerHandler)
          }
        })
        return
      }

      markerElem = $("<i id='marker-" + options.index + "' class='marker " + this.selectedMarkerData.marker.data.icon + "' style='left: -15px; top: -15px; position: absolute; color: " + this.selectedMarkerData.marker.data.color + "; font-size: " + this.selectedMarkerData.marker.data.size + ";' data-tooltip='" + this.selectedMarkerData.marker.data.name + "'></i>")
      this.markerElemHandler = new Hammer(markerElem.get(0))

      if (options.existingMarker) {
        options.existingMarker.vars({x: options.x, y: options.y}, true)
        this.updateMarkerCoordinates({
          x: options.x,
          y: options.y,
          marker: options.existingMarker._vars
        })
      } else {
        this.pinchzoomer.addMarkers([new Marker(markerElem, { x: options.x, y: options.y, transformOrigin: '50% 50%', name: this.selectedMarkerData.marker.data.name })])
      }
      
      this.markerElemHandler.on('tap', this.onMarkerHandler)
    },
    updateMarkerCoordinates(coordinates) {
      if (!coordinates) {
        return
      }

      this.mappedMarkerData.forEach((marker, index) => {
        if (marker.data.name === coordinates.marker.name) {
          this.mappedMarkerData[index].data.positionx = coordinates.x
          this.mappedMarkerData[index].data.positiony = coordinates.y
        }
      })
      this.saveDebounced()
    },
    attachEventHandler() {
      this.pzHandler.on('tap', this.onTapHandler)
    },
    detachEventHandlers() {
      this.pzHandler.off('tap', this.onTapHandler)
    },
    onTapHandler(e) {
      const markers = this.pinchzoomer.markers()

      if (!$(e.target).hasClass('marker')) {
        // Find a marker
        const markerFound = _.find(markers, (marker) => {
          return marker._vars.name === this.selectedMarkerData.marker.data.name
        })

        const clientRect = this.pinchzoomer.elem().get(0).getBoundingClientRect()
        const elemPosX = clientRect.left
        const elemPosY = clientRect.top
        const center = e.center
        const x = (center.x - elemPosX) / (this.pinchzoomer.baseZoom() * this.pinchzoomer.zoom())
        const y = (center.y - elemPosY) / (this.pinchzoomer.baseZoom() * this.pinchzoomer.zoom())

        this.addMarkers(false, {
          x: x,
          y: y,
          index: markers.length - 1,
          existingMarker: markerFound
        })
      }
    },
    onMarkerHandler(e) {
      const index = this.getMarkerIndex($(e.target).attr('id'))
      const name = $(e.target).attr('data-tooltip')
        
      if (index >= 0 && name === this.selectedMarkerData.marker.data.name) {
        this.pinchzoomer.removeMarker(index, true)
      }
    },
    getMarkerIndex(id) {
      let markerIndex = -1
      const markers = this.pinchzoomer.markers()
      
      for (let i = 0; i < markers.length; i++) {
        const marker = markers[i]
        
        if (marker.elem().attr('id') == id) {
          markerIndex = i
          i = markers.length
        }
      }
      
      return markerIndex
    },
    getMarkersData() {
      return Fliplet.DataSources.connect(this.markersDataSourceId, { offline: false })
        .then((connection) => {
          // If you want to do specific queries to return your rows
          // See the documentation here: https://developers.fliplet.com/API/fliplet-datasources.html
          this.dataSourceConnection = connection // To keep the connection to update/delete data later on
          return connection.find()
        })
    },
    cleanData() {
      const newData = []

      this.mappedMarkerData.forEach((marker, index) => {
        const newObj = {
          id: marker.id,
          data: {}
        }

        newObj.data[this.markerNameColumn] = marker.data.name
        newObj.data[this.markerFloorColumn] = marker.data.floor
        newObj.data[this.markerTypeColumn] = marker.data.type
        newObj.data[this.markerXPositionColumn] = marker.data.positionx
        newObj.data[this.markerYPositionColumn] = marker.data.positiony

        newData.push(newObj)
      })

      return newData
    },
    saveToDataSource() {
      const data = this.cleanData()
      this.dataSourceConnection.commit(data)
    },
    addNewMarker() {
      const newObj = {}
      const markerLength = this.mappedMarkerData.length

      newObj[this.markerNameColumn] = `New marker ${markerLength + 1}`
      newObj[this.markerFloorColumn] = this.widgetData.floors.length ? this.widgetData.floors[0].name : ''
      newObj[this.markerTypeColumn] = this.widgetData.markers.length ? this.widgetData.markers[0].name : ''
      newObj[this.markerXPositionColumn] = ''
      newObj[this.markerYPositionColumn] = ''

      this.dataSourceConnection.insert(newObj)
        .then(() => {
          return this.getMarkersData()
        })
        .then((data) => {
          this.markersData = data
          this.mappedMarkerData = this.mapMarkerData()
          this.setActiveMarker(0, true)
        })
    },
    saveData() {
      const markersData = _.pick(this, [
        'markersDataSourceId',
        'markerNameColumn',
        'markerFloorColumn',
        'markerTypeColumn',
        'markerXPositionColumn',
        'markerYPositionColumn'
      ])
      Fliplet.Floorplan.emit('add-markers-settings-changed', markersData)
    }
  },
  async created() {
    this.markersData = await this.getMarkersData()
    this.isLoading = false
    this.mappedMarkerData = this.mapMarkerData()

    Fliplet.Studio.onMessage((event) => {
      if (event.data && event.data.event === 'overlay-close' && event.data.data && event.data.data.dataSourceId) {
        this.reloadDataSources()
          .then((dataSources) => {
            this.dataSources = dataSources
            return this.getMarkersData()
          })
          .then((data) => {
            this.markersData = data
            this.mappedMarkerData = this.mapMarkerData()
            this.setupPinchZoomer()
          })
      }
    })

    Fliplet.Floorplan.on('add-markers-save', this.saveData)
  },
  mounted() {
    // vm.$nextTick is not enough
    setTimeout(this.setupPinchZoomer, 1000)
  },
  destroyed() {
    Fliplet.Floorplan.off('add-markers-save', this.saveData)
  }
});